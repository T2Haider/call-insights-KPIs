import { describe, expect, it } from "vitest";
import { ConfigurationError } from "@/lib/errors";
import { WebhookPayloadSchema } from "@/providers/webhook/payload";
import { createWebhookNormalizer, resolveRecordingUrl } from "@/providers/webhook/normalizer";
import {
  FAKE_CONVERSATION_ID,
  FAKE_PHONE,
  FAKE_RECORDING_URL,
  FAKE_TIMESTAMP,
  FAKE_TRANSCRIPT,
  fakePayload,
} from "./fixtures";

const normalizer = createWebhookNormalizer({
  defaultPhoneRegion: "US",
  recordingBaseUrl: "https://minio.example.com/bucket",
});

describe("webhook adapter: the sender's real payload shape", () => {
  it("maps the sample onto the normalized call", () => {
    const raw = fakePayload({ some_future_field: true });
    const n = normalizer.normalize(raw);

    expect(n).toMatchObject({
      conversationId: FAKE_CONVERSATION_ID,
      phoneNumber: FAKE_PHONE,
      recordingUrl: FAKE_RECORDING_URL,
      failed: false,
    });
    expect(n.rawPayload).toBe(raw); // original kept for debugging, including unknown fields
  });

  it("treats the single Unix-seconds timestamp as the call START, with no end time or duration", () => {
    const n = normalizer.normalize(fakePayload());
    expect(n.startedAt).toEqual(new Date(FAKE_TIMESTAMP * 1000));
    expect(n.startedAt).toEqual(new Date("2026-10-06T17:56:51Z"));
    expect(n.endedAt).toBeNull();
    expect(n.durationSeconds).toBeNull();
  });

  it("uses an end time or duration if the sender adds them later", () => {
    const withEnd = normalizer.normalize(fakePayload({ ended_at: FAKE_TIMESTAMP + 120 }));
    expect(withEnd.endedAt).toEqual(new Date((FAKE_TIMESTAMP + 120) * 1000));

    const withDuration = normalizer.normalize(fakePayload({ duration_seconds: 312.4 }));
    expect(withDuration.durationSeconds).toBe(312);
  });

  it.each([
    ["Unix seconds", FAKE_TIMESTAMP],
    ["Unix milliseconds", FAKE_TIMESTAMP * 1000],
    ["ISO-8601", "2026-10-06T17:56:51Z"],
    ["ISO with offset", "2026-10-06T10:56:51-07:00"],
  ])("understands a %s timestamp", (_label, timestamp) => {
    expect(normalizer.normalize(fakePayload({ timestamp })).startedAt).toEqual(
      new Date("2026-10-06T17:56:51Z"),
    );
  });

  it("keeps the conversation id exactly, including + and _", () => {
    expect(normalizer.normalize(fakePayload()).conversationId).toBe(
      "call-_+13125550123_AbCdEf123456",
    );
  });

  it("rejects a phone number that is not valid", () => {
    expect(() => normalizer.normalize(fakePayload({ phone_number: "12345" }))).toThrow(
      /phone_number/,
    );
  });
});

describe("webhook adapter: transcripts", () => {
  it("maps role -> speaker and message -> text, in order", () => {
    const n = normalizer.normalize(fakePayload());
    expect(n.transcript).toHaveLength(4);
    expect(n.transcript?.map((s) => s.speaker)).toEqual(["agent", "user", "agent", "user"]);
    expect(n.transcript?.[1]).toEqual({
      speaker: "user",
      text: "Yes, I'd like to update my billing address.",
    });
  });

  it("preserves messages EXACTLY: line breaks, cut-off sentences, spacing", () => {
    const n = normalizer.normalize(fakePayload());
    expect(n.transcript?.[2]?.text).toBe(
      "I can help with that.\n\nCould you share your account number?",
    );
    expect(n.transcript?.[3]?.text).toBe("Sure, it's 4 8 2 1 3. And I also wanted to ask whether");

    const odd = normalizer.normalize(
      fakePayload({
        transcript: [
          { role: "agent", message: "  leading and trailing spaces  " },
          { role: "user", message: "Hello" },
          { role: "user", message: "Hello" }, // consecutive duplicates are NOT merged
          { role: "agent", message: "ends mid-sent" },
        ],
      }),
    );
    expect(odd.transcript).toEqual([
      { speaker: "agent", text: "  leading and trailing spaces  " },
      { speaker: "user", text: "Hello" },
      { speaker: "user", text: "Hello" },
      { speaker: "agent", text: "ends mid-sent" },
    ]);
  });

  it("keeps unknown roles as received, and uses 'Unknown' only when there is none", () => {
    const n = normalizer.normalize(
      fakePayload({
        transcript: [
          { role: "supervisor", message: "Joining the call" },
          { message: "no role at all" },
          { role: "  ", message: "blank role" },
        ],
      }),
    );
    expect(n.transcript?.map((s) => s.speaker)).toEqual(["supervisor", "Unknown", "Unknown"]);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["an empty array", []],
    ["only blank messages", [{ role: "agent", message: "  \n " }]],
    ["an empty string", ""],
  ])("treats %s as 'not available yet'", (_label, transcript) => {
    expect(normalizer.normalize(fakePayload({ transcript })).transcript).toBeNull();
  });

  it("handles 30+ message transcripts", () => {
    const long = Array.from({ length: 40 }, (_, i) => ({
      role: i % 2 ? "user" : "agent",
      message: `Message ${i}`,
    }));
    expect(normalizer.normalize(fakePayload({ transcript: long })).transcript).toHaveLength(40);
  });

  it("still accepts a plain-text transcript", () => {
    expect(normalizer.normalize(fakePayload({ transcript: "  Hi there " })).transcript).toEqual([
      { speaker: "Unknown", text: "Hi there" },
    ]);
  });

  it("does not mutate the original payload", () => {
    const raw = fakePayload();
    const before = JSON.stringify(raw);
    normalizer.normalize(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(FAKE_TRANSCRIPT[2]?.message).toContain("\n\n");
  });
});

describe("resolveRecordingUrl (presigned links)", () => {
  it("returns a presigned URL EXACTLY as sent: signature and query untouched", () => {
    expect(resolveRecordingUrl(FAKE_RECORDING_URL, undefined)).toBe(FAKE_RECORDING_URL);
    expect(resolveRecordingUrl(`  ${FAKE_RECORDING_URL}  `, undefined)).toBe(FAKE_RECORDING_URL);
  });

  it("returns null when there is no link yet (missing, empty or blank)", () => {
    for (const empty of [null, undefined, "", "   "]) {
      expect(resolveRecordingUrl(empty, undefined)).toBeNull();
    }
  });

  it("rejects something that looks like a URL but is not", () => {
    expect(() => resolveRecordingUrl("https://", undefined)).toThrow(/valid URL/);
  });

  it("joins object paths onto the base URL, with or without slashes", () => {
    for (const base of ["https://m.example.com/rec", "https://m.example.com/rec/"]) {
      for (const path of ["a/b.wav", "/a/b.wav"]) {
        expect(resolveRecordingUrl(path, base)).toBe("https://m.example.com/rec/a/b.wav");
      }
    }
  });

  it("raises a configuration error (our fault, not the sender's) when a path cannot be resolved", () => {
    expect(() => resolveRecordingUrl("a/b.wav", undefined)).toThrow(ConfigurationError);
  });
});

describe("WebhookPayloadSchema", () => {
  it("requires conversation_id, phone_number and timestamp", () => {
    for (const missing of ["conversation_id", "phone_number", "timestamp"]) {
      const body = fakePayload();
      delete body[missing];
      expect(WebhookPayloadSchema.safeParse(body).success).toBe(false);
    }
  });

  it("allows transcript and recording to be absent, null or empty (call not fully ready)", () => {
    const minimal = fakePayload();
    delete minimal.transcript;
    delete minimal.call_recording_path;
    expect(WebhookPayloadSchema.safeParse(minimal).success).toBe(true);
    expect(
      WebhookPayloadSchema.safeParse(fakePayload({ transcript: null, call_recording_path: null }))
        .success,
    ).toBe(true);
    expect(
      WebhookPayloadSchema.safeParse(fakePayload({ transcript: [], call_recording_path: "" }))
        .success,
    ).toBe(true);
  });

  it("rejects a malformed transcript", () => {
    expect(WebhookPayloadSchema.safeParse(fakePayload({ transcript: 42 })).success).toBe(false);
    expect(
      WebhookPayloadSchema.safeParse(fakePayload({ transcript: [{ role: "agent" }] })).success,
    ).toBe(false);
  });
});
