import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  deleteCallsStartedBefore,
  findCallByConversationId,
  listCallsByStatus,
  upsertCall,
} from "@/db/callRepository";
import {
  getIngestionState,
  recordCallReceived,
  recordRequestRejected,
} from "@/db/ingestionStateRepository";
import { builderFor, memoryDb } from "./helpers";

let db: Db;
beforeEach(() => {
  db = memoryDb();
});

describe("upsertCall idempotency", () => {
  it("creates once and reports unchanged on identical re-ingest", () => {
    const first = upsertCall(db, "conv-1", builderFor({}));
    const second = upsertCall(db, "conv-1", builderFor({}));
    const third = upsertCall(db, "conv-1", builderFor({}));

    expect(first.change).toBe("created");
    expect(second.change).toBe("unchanged");
    expect(third.change).toBe("unchanged");
    expect(second.call.id).toBe(first.call.id);
    expect(second.call.updatedAt).toEqual(first.call.updatedAt);
  });

  it("never creates duplicate rows for one conversationId", () => {
    for (let i = 0; i < 5; i++) upsertCall(db, "conv-1", builderFor({}));
    upsertCall(db, "conv-2", builderFor({ conversationId: "conv-2" }));
    expect(listCallsByStatus(db, "completed")).toHaveLength(2);
  });
});

describe("updating processing calls", () => {
  it("starts as processing, then completes in place when data arrives", () => {
    const processing = upsertCall(
      db,
      "conv-1",
      builderFor({ recordingUrl: null, transcript: null }),
    );
    expect(processing.call.status).toBe("processing");
    expect(listCallsByStatus(db, "processing")).toHaveLength(1);

    const later = new Date("2026-01-01T10:07:00Z");
    const done = upsertCall(db, "conv-1", builderFor({}, later), later);

    expect(done.change).toBe("updated");
    expect(done.call.id).toBe(processing.call.id);
    expect(done.call.status).toBe("completed");
    expect(done.call.recordingUrl).toContain("minio");
    expect(done.call.createdAt).toEqual(processing.call.createdAt);
    expect(listCallsByStatus(db, "processing")).toHaveLength(0);
  });

  it("never erases data already stored when a later fetch returns null", () => {
    upsertCall(db, "conv-1", builderFor({}));
    const result = upsertCall(db, "conv-1", builderFor({ recordingUrl: null, transcript: null }));
    expect(result.change).toBe("unchanged");
    expect(findCallByConversationId(db, "conv-1")?.status).toBe("completed");
  });

  it("round-trips transcript, raw payload and dates", () => {
    upsertCall(
      db,
      "conv-1",
      builderFor({ transcript: [{ speaker: "Agent", text: "Hi", timestamp: 1.5 }] }),
    );
    const call = findCallByConversationId(db, "conv-1");
    expect(call?.transcript).toEqual([{ speaker: "Agent", text: "Hi", timestamp: 1.5 }]);
    expect(call?.rawPayload).toEqual({ id: "conv-1" });
    expect(call?.startedAt).toEqual(new Date("2026-01-01T10:00:00Z"));
    expect(call?.durationSeconds).toBe(300);
  });
});

describe("ingestion state", () => {
  it("starts empty", () => {
    expect(getIngestionState(db, "webhook")).toEqual({
      provider: "webhook",
      lastReceivedAt: null,
      lastRejectedAt: null,
      lastRejectReason: null,
    });
  });

  it("records received calls and rejections independently", () => {
    const t1 = new Date("2026-01-01T10:00:00Z");
    const t2 = new Date("2026-01-01T10:05:00Z");
    recordCallReceived(db, "webhook", t1);
    recordRequestRejected(db, "webhook", "401 Missing or invalid bearer token", t2);
    expect(getIngestionState(db, "webhook")).toMatchObject({
      lastReceivedAt: t1,
      lastRejectedAt: t2,
      lastRejectReason: "401 Missing or invalid bearer token",
    });
    const t3 = new Date("2026-01-01T10:10:00Z");
    recordCallReceived(db, "webhook", t3);
    expect(getIngestionState(db, "webhook")).toMatchObject({
      lastReceivedAt: t3,
      lastRejectedAt: t2,
    });
  });
});

describe("deleteCallsStartedBefore", () => {
  it("removes only older rows and reports the count", () => {
    upsertCall(
      db,
      "old",
      builderFor({
        conversationId: "old",
        startedAt: new Date("2025-01-01T00:00:00Z"),
        endedAt: new Date("2025-01-01T00:05:00Z"),
      }),
    );
    upsertCall(db, "new", builderFor({ conversationId: "new" }));
    const removed = deleteCallsStartedBefore(db, new Date("2025-06-01T00:00:00Z"));
    expect(removed).toBe(1);
    expect(findCallByConversationId(db, "old")).toBeNull();
    expect(findCallByConversationId(db, "new")).not.toBeNull();
  });
});
