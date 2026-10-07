import { describe, expect, it } from "vitest";
import { upsertCall } from "@/db/callRepository";
import { recordCallReceived, recordRequestRejected } from "@/db/ingestionStateRepository";
import { toCallSummaryDto, type CallSummaryDto } from "@/domain/callDto";
import { formatSse, SseHub } from "@/events/hub";
import { secretsMatch } from "@/lib/internalAuth";
import { callsReducer, initialCallsState, type CallsState } from "@/hooks/callsReducer";
import {
  decodeCursor,
  encodeCursor,
  getCallDetail,
  InvalidCursorError,
  listCalls,
} from "@/services/callQueries";
import { getIngestionStatus } from "@/services/ingestionStatus";
import { builderFor, memoryDb } from "./helpers";

describe("SseHub", () => {
  it("delivers to every subscriber and stops after unsubscribe", () => {
    const hub = new SseHub();
    const a: string[] = [];
    const b: string[] = [];
    const offA = hub.subscribe((e) => a.push(e.callId));
    hub.subscribe((e) => b.push(e.callId));
    const event = { type: "call.created" as const, callId: "1", conversationId: "c1" };

    expect(hub.broadcast(event)).toBe(2);
    offA();
    expect(hub.broadcast({ ...event, callId: "2" })).toBe(1);

    expect(a).toEqual(["1"]);
    expect(b).toEqual(["1", "2"]);
    expect(hub.size).toBe(1);
  });

  it("drops a listener that throws without affecting the others", () => {
    const hub = new SseHub();
    const received: string[] = [];
    hub.subscribe(() => {
      throw new Error("closed connection");
    });
    hub.subscribe((e) => received.push(e.callId));

    expect(hub.broadcast({ type: "call.updated", callId: "1", conversationId: "c" })).toBe(1);
    expect(hub.size).toBe(1);
    expect(received).toEqual(["1"]);
  });

  it("formats SSE frames", () => {
    expect(formatSse("call", { a: 1 })).toBe('event: call\ndata: {"a":1}\n\n');
  });
});

describe("secretsMatch", () => {
  it("accepts only the exact secret", () => {
    expect(secretsMatch("s3cret-value", "s3cret-value")).toBe(true);
    expect(secretsMatch("s3cret-valuf", "s3cret-value")).toBe(false);
    expect(secretsMatch("", "s3cret-value")).toBe(false);
    expect(secretsMatch(null, "s3cret-value")).toBe(false);
  });
});

describe("listCalls pagination", () => {
  function seed(count: number) {
    const db = memoryDb();
    for (let i = 0; i < count; i++) {
      const start = new Date(Date.UTC(2026, 0, 1, 10, i));
      upsertCall(
        db,
        `c${i}`,
        builderFor({
          conversationId: `c${i}`,
          startedAt: start,
          endedAt: new Date(start.getTime() + 60_000),
        }),
      );
    }
    return db;
  }

  it("returns newest first, pages without gaps or repeats, and ends with a null cursor", () => {
    const db = seed(5);
    const first = listCalls(db, { limit: 2 });
    const second = listCalls(db, { limit: 2, cursor: first.nextCursor });
    const third = listCalls(db, { limit: 2, cursor: second.nextCursor });

    const ids = [...first.items, ...second.items, ...third.items].map((c) => c.conversationId);
    expect(ids).toEqual(["c4", "c3", "c2", "c1", "c0"]);
    expect(third.nextCursor).toBeNull();
  });

  it("handles calls that share a start time", () => {
    const db = memoryDb();
    for (const id of ["x", "y", "z"]) upsertCall(db, id, builderFor({ conversationId: id }));
    const a = listCalls(db, { limit: 2 });
    const b = listCalls(db, { limit: 2, cursor: a.nextCursor });
    const all = [...a.items, ...b.items].map((c) => c.conversationId);
    expect(new Set(all).size).toBe(3);
  });

  it("rejects malformed cursors and round-trips valid ones", () => {
    expect(() => decodeCursor("garbage")).toThrow(InvalidCursorError);
    const when = new Date("2026-01-01T10:00:00Z");
    expect(decodeCursor(encodeCursor(when, "abc"))).toEqual({ startedAt: when, id: "abc" });
  });

  it("never exposes the raw payload; detail includes the transcript, list does not", () => {
    const db = seed(1);
    const [item] = listCalls(db, {}).items;
    expect(item).not.toHaveProperty("rawPayload");
    expect(item).not.toHaveProperty("transcript");
    expect(item?.hasTranscript).toBe(true);
    const detail = getCallDetail(db, item!.id);
    expect(detail?.transcript).toHaveLength(1);
    expect(detail).not.toHaveProperty("rawPayload");
  });
});

describe("ingestion status", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const status = (db: ReturnType<typeof memoryDb>) =>
    getIngestionStatus(db, { provider: "webhook", now });

  it("reports no calls yet on a fresh database", () => {
    expect(status(memoryDb())).toMatchObject({ lastReceivedAt: null, recentRejection: null });
  });

  it("reports when the last call was received (a quiet spell is not an error)", () => {
    const db = memoryDb();
    recordCallReceived(db, "webhook", ago(3 * 3600_000));
    expect(status(db)).toMatchObject({
      lastReceivedAt: ago(3 * 3600_000).toISOString(),
      recentRejection: null,
    });
  });

  it("shows a recent rejection until a call is accepted after it", () => {
    const db = memoryDb();
    recordCallReceived(db, "webhook", ago(60_000));
    recordRequestRejected(db, "webhook", "401 Missing or invalid bearer token", ago(30_000));
    expect(status(db).recentRejection).toEqual({
      at: ago(30_000).toISOString(),
      reason: "401 Missing or invalid bearer token",
    });

    recordCallReceived(db, "webhook", ago(10_000));
    expect(status(db).recentRejection).toBeNull();
  });

  it("stops showing an old rejection", () => {
    const db = memoryDb();
    recordRequestRejected(db, "webhook", "400 Body must be valid JSON", ago(20 * 60_000));
    expect(status(db).recentRejection).toBeNull();
  });
});

describe("callsReducer", () => {
  const page = (
    s: CallsState,
    calls: CallSummaryDto[],
    nextCursor: string | null | undefined,
    highlight: "none" | "new" | "changed" = "none",
  ) => callsReducer(s, { type: "pageLoaded", calls, nextCursor, highlight });

  function dto(
    id: string,
    startedAt: string,
    updatedAt = "2026-01-01T10:00:00.000Z",
  ): CallSummaryDto {
    const db = memoryDb();
    const { call } = upsertCall(
      db,
      id,
      builderFor({
        conversationId: id,
        startedAt: new Date(startedAt),
        endedAt: new Date(startedAt),
      }),
    );
    return { ...toCallSummaryDto(call), id, updatedAt };
  }
  const merged = (s: CallsState, calls: CallSummaryDto[], highlight: "none" | "new" | "changed") =>
    callsReducer(s, { type: "merged", calls, highlight });

  it("loads without highlighting and shows newest first", () => {
    const s = merged(
      initialCallsState,
      [dto("old", "2026-01-01T09:00:00Z"), dto("new", "2026-01-01T11:00:00Z")],
      "none",
    );
    expect(s.items.map((c) => c.id)).toEqual(["new", "old"]);
    expect(s.highlighted).toEqual([]);
    expect(s.status).toBe("ready");
  });

  it("puts a new live call at the top and highlights it", () => {
    let s = merged(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "none");
    s = merged(s, [dto("b", "2026-01-01T10:00:00Z")], "changed");
    expect(s.items.map((c) => c.id)).toEqual(["b", "a"]);
    expect(s.highlighted).toEqual(["b"]);
  });

  it("updates a processing call in place and highlights the change", () => {
    let s = merged(
      initialCallsState,
      [dto("a", "2026-01-01T09:00:00Z", "2026-01-01T10:00:00.000Z")],
      "none",
    );
    const done = {
      ...dto("a", "2026-01-01T09:00:00Z", "2026-01-01T10:00:05.000Z"),
      status: "completed" as const,
    };
    s = merged(s, [done], "changed");
    expect(s.items).toHaveLength(1);
    expect(s.items[0]?.status).toBe("completed");
    expect(s.highlighted).toEqual(["a"]);
  });

  it("ignores stale data so a slow refetch cannot overwrite a fresher update", () => {
    const fresh = {
      ...dto("a", "2026-01-01T09:00:00Z", "2026-01-01T10:00:09.000Z"),
      status: "completed" as const,
    };
    let s = merged(initialCallsState, [fresh], "none");
    s = merged(s, [dto("a", "2026-01-01T09:00:00Z", "2026-01-01T10:00:01.000Z")], "new");
    expect(s.items[0]?.status).toBe("completed");
  });

  it("on reconnect refetch (mode new) highlights only calls it had missed", () => {
    let s = merged(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "none");
    s = merged(s, [dto("a", "2026-01-01T09:00:00Z"), dto("missed", "2026-01-01T10:00:00Z")], "new");
    expect(s.highlighted).toEqual(["missed"]);
  });

  it("tracks the pagination cursor and appends older pages", () => {
    let s = page(initialCallsState, [dto("new", "2026-01-01T11:00:00Z")], "cursor-1");
    expect(s).toMatchObject({ nextCursor: "cursor-1", status: "ready" });
    s = callsReducer(s, { type: "loadMoreStarted" });
    expect(s.loadingMore).toBe(true);
    s = page(s, [dto("old", "2026-01-01T09:00:00Z")], null);
    expect(s.items.map((c) => c.id)).toEqual(["new", "old"]);
    expect(s).toMatchObject({ nextCursor: null, loadingMore: false });
  });

  it("a reconnect refetch (cursor undefined) keeps the pagination cursor", () => {
    let s = page(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "cursor-1");
    s = page(s, [dto("a", "2026-01-01T09:00:00Z")], undefined, "new");
    expect(s.nextCursor).toBe("cursor-1");
  });

  it("reset (filters changed) clears everything", () => {
    let s = page(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "c", "new");
    s = callsReducer(s, { type: "reset" });
    expect(s).toEqual(initialCallsState);
  });

  it("a failed load-more keeps items and shows the error", () => {
    let s = page(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "c");
    s = callsReducer(s, { type: "loadMoreStarted" });
    s = callsReducer(s, { type: "loadMoreFailed", error: "boom" });
    expect(s).toMatchObject({ loadingMore: false, error: "boom", status: "ready" });
    expect(s.items).toHaveLength(1);
  });

  it("clears highlights, and keeps showing data after a failed reload", () => {
    let s = merged(initialCallsState, [dto("a", "2026-01-01T09:00:00Z")], "changed");
    s = callsReducer(s, { type: "highlightCleared", ids: ["a"] });
    expect(s.highlighted).toEqual([]);
    s = callsReducer(s, { type: "loadFailed", error: "network" });
    expect(s.status).toBe("ready");
    expect(s.error).toBe("network");
    expect(callsReducer(initialCallsState, { type: "loadFailed", error: "x" }).status).toBe(
      "error",
    );
  });
});
