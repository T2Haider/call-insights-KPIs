import { describe, expect, it } from "vitest";
import { findCallByConversationId, upsertCall } from "@/db/callRepository";
import type { Logger } from "@/lib/logger";
import { runRetentionCleanup } from "@/worker/retention";
import { builderFor, memoryDb } from "./helpers";

describe("runRetentionCleanup", () => {
  const logs: string[] = [];
  const logger: Logger = {
    debug: (m) => logs.push(m),
    info: (m) => logs.push(m),
    warn: (m) => logs.push(m),
    error: (m) => logs.push(m),
  };
  const now = new Date("2026-03-01T00:00:00Z");
  const day = 86_400_000;

  function seed() {
    const db = memoryDb();
    const at = (daysAgo: number, id: string) => {
      const start = new Date(now.getTime() - daysAgo * day);
      upsertCall(
        db,
        id,
        builderFor({
          conversationId: id,
          startedAt: start,
          endedAt: new Date(start.getTime() + 60_000),
        }),
      );
    };
    at(45, "old-45");
    at(31, "old-31");
    at(29, "recent-29");
    at(1, "recent-1");
    return db;
  }

  it("deletes only calls older than RETENTION_DAYS and logs how many", () => {
    const db = seed();
    logs.length = 0;

    const removed = runRetentionCleanup({ db, retentionDays: 30, logger, now });

    expect(removed).toBe(2);
    expect(findCallByConversationId(db, "old-45")).toBeNull();
    expect(findCallByConversationId(db, "old-31")).toBeNull();
    expect(findCallByConversationId(db, "recent-29")).not.toBeNull();
    expect(findCallByConversationId(db, "recent-1")).not.toBeNull();
    expect(logs.some((l) => l.includes("removed 2 call(s)"))).toBe(true);
  });

  it("does nothing when RETENTION_DAYS=0", () => {
    const db = seed();
    expect(runRetentionCleanup({ db, retentionDays: 0, logger, now })).toBe(0);
    expect(findCallByConversationId(db, "old-45")).not.toBeNull();
  });

  it("is safe to run repeatedly", () => {
    const db = seed();
    runRetentionCleanup({ db, retentionDays: 30, logger, now });
    expect(runRetentionCleanup({ db, retentionDays: 30, logger, now })).toBe(0);
  });
});
