import { describe, expect, it } from "vitest";
import { findCallByConversationId, upsertCall } from "@/db/callRepository";
import type { CallEvent, EventPublisher } from "@/events/types";
import type { Logger } from "@/lib/logger";
import { runProcessingTimeoutCheck } from "@/worker/maintenance";
import { builderFor, memoryDb, TIMEOUT_MS } from "./helpers";

const silent: Logger = { debug() {}, info() {}, warn() {}, error() {} };

describe("runProcessingTimeoutCheck", () => {
  // The timeout counts from when WE received the call (createdAt), not from any call timestamp.
  const ended = new Date("2026-01-01T10:05:00Z");

  function setup() {
    const db = memoryDb();
    const events: CallEvent[] = [];
    const publisher: EventPublisher = {
      publish: async (e) => {
        events.push(...e);
      },
    };
    const add = (id: string, overrides: Parameters<typeof builderFor>[0]) =>
      upsertCall(db, id, builderFor({ conversationId: id, ...overrides }, ended), ended);
    add("stuck", { recordingUrl: null, transcript: null });
    add("done", {});
    return { db, events, publisher };
  }

  const run = (s: ReturnType<typeof setup>, now: Date) =>
    runProcessingTimeoutCheck({
      db: s.db,
      publisher: s.publisher,
      processingTimeoutMs: TIMEOUT_MS,
      logger: silent,
      now,
    });

  it("leaves a processing call alone until the timeout passes", async () => {
    const s = setup();
    expect(await run(s, new Date(ended.getTime() + TIMEOUT_MS - 1000))).toBe(0);
    expect(findCallByConversationId(s.db, "stuck")?.status).toBe("processing");
    expect(s.events).toEqual([]);
  });

  it("marks only the stuck call as failed after the timeout, and broadcasts it", async () => {
    const s = setup();
    expect(await run(s, new Date(ended.getTime() + TIMEOUT_MS + 1000))).toBe(1);
    expect(findCallByConversationId(s.db, "stuck")?.status).toBe("failed");
    expect(findCallByConversationId(s.db, "done")?.status).toBe("completed");
    expect(s.events).toEqual([
      expect.objectContaining({ type: "call.updated", conversationId: "stuck" }),
    ]);
  });

  it("does not touch the same call twice", async () => {
    const s = setup();
    const late = new Date(ended.getTime() + TIMEOUT_MS + 1000);
    await run(s, late);
    expect(await run(s, late)).toBe(0);
    expect(s.events).toHaveLength(1);
  });

  it("lets a late webhook complete a call that was marked failed", async () => {
    const s = setup();
    await run(s, new Date(ended.getTime() + TIMEOUT_MS + 1000));
    upsertCall(
      s.db,
      "stuck",
      builderFor({ conversationId: "stuck" }, new Date(ended.getTime() + 1000)),
    );
    expect(findCallByConversationId(s.db, "stuck")?.status).toBe("completed");
  });
});
