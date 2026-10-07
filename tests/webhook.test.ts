import { beforeEach, describe, expect, it } from "vitest";
import { findCallByConversationId, listCallsByStatus } from "@/db/callRepository";
import type { Db } from "@/db/client";
import { getIngestionState } from "@/db/ingestionStateRepository";
import { SseHub } from "@/events/hub";
import { HubEventPublisher } from "@/events/hubPublisher";
import type { CallEvent, EventPublisher } from "@/events/types";
import { handleCallEndedWebhook, type WebhookDeps } from "@/ingestion/webhookHandler";
import type { Logger } from "@/lib/logger";
import { createWebhookNormalizer } from "@/providers/webhook/normalizer";
import { getCallDetail } from "@/services/callQueries";
import {
  FAKE_CONVERSATION_ID,
  FAKE_PHONE,
  FAKE_RECORDING_URL,
  FAKE_TIMESTAMP,
  FAKE_TRANSCRIPT,
  fakePayload,
} from "./fixtures";
import { memoryDb } from "./helpers";

const SECRET = "test-webhook-secret-123";
const URL_ = "http://localhost/api/webhooks/call-ended";
const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };
const payload = fakePayload;

function post(
  body: unknown,
  headers: Record<string, string> = { authorization: `Bearer ${SECRET}` },
): Request {
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

class SpyPublisher implements EventPublisher {
  events: CallEvent[] = [];
  async publish(events: CallEvent[]) {
    this.events.push(...events);
  }
}

let db: Db;
let spy: SpyPublisher;
const now = new Date("2026-10-06T18:00:00Z");

function deps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    db,
    secret: SECRET,
    maxBodyBytes: 20_000,
    normalizer: createWebhookNormalizer({
      defaultPhoneRegion: "US",
      recordingBaseUrl: "https://minio.example.com/bucket/",
    }),
    publisher: spy,
    processingTimeoutMs: 120 * 60_000,
    logger: silent,
    now: () => now,
    ...overrides,
  };
}

const call = (request: Request, d: WebhookDeps = deps()) => handleCallEndedWebhook(request, d);
const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

beforeEach(() => {
  db = memoryDb();
  spy = new SpyPublisher();
});

describe("webhook authentication", () => {
  it.each([
    ["no Authorization header", {}],
    ["wrong secret", { authorization: "Bearer not-the-secret" }],
    ["wrong scheme", { authorization: `Basic ${SECRET}` }],
    ["empty token", { authorization: "Bearer " }],
    ["secret without scheme", { authorization: SECRET }],
  ])("rejects %s with 401 and saves nothing", async (_label, headers) => {
    const response = await call(post(payload(), headers));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)).toBeNull();
    expect(spy.events).toEqual([]);
  });

  it("checks the secret before reading the body (a huge unauthenticated body gets 401, not 413)", async () => {
    const response = await call(post("x".repeat(50_000), {}));
    expect(response.status).toBe(401);
  });

  it("accepts the bearer scheme case-insensitively", async () => {
    const response = await call(post(payload(), { authorization: `bearer ${SECRET}` }));
    expect(response.status).toBe(200);
  });

  it("records rejections for the header status", async () => {
    await call(post(payload(), {}));
    expect(getIngestionState(db, "webhook")).toMatchObject({
      lastRejectedAt: now,
      lastRejectReason: "401 Missing or invalid bearer token",
    });
  });
});

describe("webhook body limits", () => {
  it("returns 413 for a body over the limit, streamed without a Content-Length", async () => {
    const huge = payload({ transcript: [{ role: "agent", message: "x".repeat(30_000) }] });
    const response = await call(post(huge));
    expect(response.status).toBe(413);
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)).toBeNull();
  });

  it("returns 413 immediately when Content-Length already exceeds the limit", async () => {
    const response = await call(
      post(payload(), { authorization: `Bearer ${SECRET}`, "content-length": "999999" }),
    );
    expect(response.status).toBe(413);
  });

  it("accepts a long (40 message) transcript within the limit", async () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 ? "user" : "agent",
      message: `Message ${i}: ${"word ".repeat(20)}`,
    }));
    expect((await call(post(payload({ transcript: long })))).status).toBe(200);
  });
});

describe("webhook validation (400)", () => {
  it.each([
    ["invalid JSON", "{not json"],
    ["an empty body", ""],
    ["a JSON array instead of an object", "[]"],
    ["a missing conversation_id", payload({ conversation_id: undefined })],
    ["an empty conversation_id", payload({ conversation_id: "  " })],
    ["a missing phone_number", payload({ phone_number: undefined })],
    ["a missing timestamp", payload({ timestamp: undefined })],
    ["an unparseable timestamp", payload({ timestamp: "yesterday-ish" })],
    ["a transcript of the wrong type", payload({ transcript: 42 })],
    ["a transcript message without text", payload({ transcript: [{ role: "agent" }] })],
    ["an invalid phone number", payload({ phone_number: "123" })],
    ["an invalid recording URL", payload({ call_recording_path: "https://" })],
  ])("rejects %s", async (_label, body) => {
    const response = await call(post(body));
    expect(response.status).toBe(400);
    expect(typeof (await json(response)).error).toBe("string");
    expect(listCallsByStatus(db, "completed")).toHaveLength(0);
    expect(spy.events).toEqual([]);
  });

  it("names the problem so the sender can fix it", async () => {
    const response = await call(post(payload({ conversation_id: undefined })));
    expect((await json(response)).error).toMatch(/conversation_id/);
  });

  it("never echoes the submitted transcript or recording link back in an error", async () => {
    const response = await call(post(payload({ phone_number: "123" })));
    const text = JSON.stringify(await json(response));
    expect(text).not.toContain("your AI assistant");
    expect(text).not.toContain("X-Amz-Signature");
  });
});

describe("webhook success and idempotency", () => {
  it("creates the call from the sender's real payload shape and publishes straight to the hub", async () => {
    const hub = new SseHub();
    const received: CallEvent[] = [];
    hub.subscribe((e) => received.push(e));

    const response = await call(post(payload()), deps({ publisher: new HubEventPublisher(hub) }));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      status: "created",
      conversationId: FAKE_CONVERSATION_ID,
    });

    const saved = findCallByConversationId(db, FAKE_CONVERSATION_ID);
    expect(saved).toMatchObject({
      phoneNumber: FAKE_PHONE,
      status: "completed",
      provider: "webhook",
      recordingUrl: FAKE_RECORDING_URL,
      endedAt: null,
      durationSeconds: null,
    });
    expect(saved?.startedAt).toEqual(new Date(FAKE_TIMESTAMP * 1000));
    expect(saved?.rawPayload).toMatchObject({ conversation_id: FAKE_CONVERSATION_ID });
    expect(received).toEqual([
      { type: "call.created", callId: saved?.id, conversationId: FAKE_CONVERSATION_ID },
    ]);
  });

  it("preserves transcript messages exactly through the whole pipeline (webhook -> DB -> API)", async () => {
    await call(post(payload()));
    const saved = findCallByConversationId(db, FAKE_CONVERSATION_ID);
    const detail = getCallDetail(db, saved!.id);

    expect(detail?.transcript).toEqual(
      FAKE_TRANSCRIPT.map((m) => ({ speaker: m.role, text: m.message })),
    );
    expect(detail?.transcript?.[2]?.text).toBe(
      "I can help with that.\n\nCould you share your account number?",
    );
    expect(detail?.transcript?.[3]?.text.endsWith("whether")).toBe(true); // cut-off kept as is
  });

  it("stores the presigned recording link byte-for-byte", async () => {
    await call(post(payload()));
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)?.recordingUrl).toBe(
      FAKE_RECORDING_URL,
    );
  });

  it("records when the last call was received", async () => {
    await call(post(payload()));
    expect(getIngestionState(db, "webhook").lastReceivedAt).toEqual(now);
  });

  it("answers 200 for a duplicate, creates no second row, and sends no second event", async () => {
    const first = await call(post(payload()));
    const second = await call(post(payload()));
    const third = await call(post(payload()));

    expect(first.status).toBe(200);
    expect([(await json(second)).status, (await json(third)).status]).toEqual([
      "unchanged",
      "unchanged",
    ]);
    expect(second.status).toBe(200);
    expect(listCallsByStatus(db, "completed")).toHaveLength(1);
    expect(spy.events).toHaveLength(1);
  });
});

describe("webhook safety net: incomplete calls and merging", () => {
  it("treats a missing, empty or blank transcript/recording as 'not ready yet': the call stays processing", async () => {
    for (const [i, early] of [
      { transcript: undefined, call_recording_path: undefined },
      { transcript: [], call_recording_path: "" },
      { transcript: null, call_recording_path: null },
    ].entries()) {
      const id = `${FAKE_CONVERSATION_ID}-${i}`;
      const response = await call(post(payload({ conversation_id: id, ...early })));
      expect(response.status).toBe(200);
      expect(findCallByConversationId(db, id)?.status).toBe("processing");
    }
  });

  it("an early send without data, then the complete send, merges in place and broadcasts an update", async () => {
    const early = await call(post(payload({ transcript: [], call_recording_path: "" })));
    expect(await json(early)).toMatchObject({ status: "created" });
    const processing = findCallByConversationId(db, FAKE_CONVERSATION_ID);
    expect(processing?.status).toBe("processing");

    const later = await call(post(payload()));
    expect(await json(later)).toMatchObject({ status: "updated" });
    const completed = findCallByConversationId(db, FAKE_CONVERSATION_ID);
    expect(completed?.id).toBe(processing?.id);
    expect(completed?.status).toBe("completed");
    expect(spy.events.map((e) => e.type)).toEqual(["call.created", "call.updated"]);
  });

  it("never erases data when an incomplete copy arrives after the complete one", async () => {
    await call(post(payload()));
    const late = await call(post(payload({ transcript: [], call_recording_path: "" })));
    expect(await json(late)).toMatchObject({ status: "unchanged" });
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)?.status).toBe("completed");
  });

  it("replaces an expired link with a newer one from a later send", async () => {
    await call(post(payload()));
    const fresh = `${FAKE_RECORDING_URL}&refreshed=1`;
    const response = await call(post(payload({ call_recording_path: fresh })));
    expect(await json(response)).toMatchObject({ status: "updated" });
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)?.recordingUrl).toBe(fresh);
  });
});

describe("webhook server-side failures (5xx so the sender retries)", () => {
  it("returns 500, not 400, when OUR configuration is at fault, and saves nothing", async () => {
    const noBase = deps({ normalizer: createWebhookNormalizer({ defaultPhoneRegion: "US" }) });
    const response = await call(post(payload({ call_recording_path: "a/b.wav" })), noBase);
    expect(response.status).toBe(500);
    expect(findCallByConversationId(db, FAKE_CONVERSATION_ID)).toBeNull();
  });

  it("returns 500 when something unexpected throws, and the retry is then harmless", async () => {
    const broken: EventPublisher = {
      publish: async () => {
        throw new Error("hub exploded");
      },
    };
    const first = await call(post(payload()), deps({ publisher: broken }));
    expect(first.status).toBe(500);
    // The call was saved before the broadcast failed; the sender's retry is a no-op duplicate.
    const retry = await call(post(payload()));
    expect(retry.status).toBe(200);
    expect(await json(retry)).toMatchObject({ status: "unchanged" });
    expect(listCallsByStatus(db, "completed")).toHaveLength(1);
  });
});
