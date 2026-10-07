import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gte, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Call, CallStatus } from "@/domain/call";
import { parseSearch, type CallFilters } from "@/domain/callFilters";
import { sameCallContent, type CallWrite } from "@/domain/mergeCall";
import type { Db } from "./client";
import { calls } from "./schema";

export type UpsertChange = "created" | "updated" | "unchanged";

export interface UpsertResult {
  call: Call;
  change: UpsertChange;
}

type CallRow = typeof calls.$inferSelect;

function toCall(row: CallRow): Call {
  return { ...row };
}

function sameContent(existing: Call, next: CallWrite): boolean {
  return (
    sameCallContent(existing, next) &&
    JSON.stringify(existing.rawPayload) === JSON.stringify(next.rawPayload)
  );
}

export function countCalls(db: Db): number {
  return db.select({ n: count() }).from(calls).get()?.n ?? 0;
}

export function findCallByConversationId(db: Db, conversationId: string): Call | null {
  const row = db.select().from(calls).where(eq(calls.conversationId, conversationId)).get();
  return row ? toCall(row) : null;
}

export function findCallById(db: Db, id: string): Call | null {
  const row = db.select().from(calls).where(eq(calls.id, id)).get();
  return row ? toCall(row) : null;
}

export function listCallsByStatus(db: Db, status: CallStatus): Call[] {
  return db.select().from(calls).where(eq(calls.status, status)).all().map(toCall);
}

export function listCallsByConversationIds(db: Db, ids: string[]): Call[] {
  if (ids.length === 0) return [];
  return db.select().from(calls).where(inArray(calls.conversationId, ids)).all().map(toCall);
}

/**
 * Idempotent save keyed by conversationId. The read-decide-write runs in one
 * transaction; `build` receives the existing row (or null) and returns what to
 * store, so merge rules live in the domain layer, not here.
 * An identical write is reported as "unchanged" and does not touch updatedAt,
 * so callers can skip broadcasting.
 */
export function upsertCall(
  db: Db,
  conversationId: string,
  build: (existing: Call | null) => CallWrite,
  now: Date = new Date(),
): UpsertResult {
  return db.transaction((tx) => {
    const row = tx.select().from(calls).where(eq(calls.conversationId, conversationId)).get();
    const existing = row ? toCall(row) : null;
    const next = build(existing);

    if (!existing) {
      const inserted = tx
        .insert(calls)
        .values({ ...next, id: randomUUID(), createdAt: now, updatedAt: now })
        .returning()
        .get();
      return { call: toCall(inserted), change: "created" as const };
    }

    if (sameContent(existing, next)) return { call: existing, change: "unchanged" as const };

    const updated = tx
      .update(calls)
      .set({ ...next, updatedAt: now })
      .where(eq(calls.id, existing.id))
      .returning()
      .get();
    return { call: toCall(updated), change: "updated" as const };
  });
}

/**
 * Retention: deletes the dashboard's own records (details, transcript, stored
 * recording LINK) for calls that started before `cutoff`. This only touches
 * our database. It never contacts MinIO or deletes recording files.
 * Returns the number of rows removed.
 */
export function deleteCallsStartedBefore(db: Db, cutoff: Date): number {
  return db.delete(calls).where(lt(calls.startedAt, cutoff)).run().changes;
}

/** Most recent calls still waiting on a recording/transcript, newest first. */
export function listProcessingCalls(db: Db, limit: number): Call[] {
  return db
    .select()
    .from(calls)
    .where(eq(calls.status, "processing"))
    .orderBy(desc(calls.startedAt))
    .limit(limit)
    .all()
    .map(toCall);
}

/** Marks a call failed, e.g. when the provider no longer returns it past the timeout. */
export function markCallFailed(db: Db, id: string, now: Date = new Date()): Call | null {
  const row = db
    .update(calls)
    .set({ status: "failed", updatedAt: now })
    .where(eq(calls.id, id))
    .returning()
    .get();
  return row ? toCall(row) : null;
}

export interface CallsPageParams {
  limit: number;
  filters?: CallFilters;
  /** Keyset position: return calls strictly after this one in (startedAt desc, id desc) order. */
  after?: { startedAt: Date; id: string };
}

/** Escapes LIKE wildcards so user input is matched literally. */
function likeContains(
  column: typeof calls.conversationId | typeof calls.phoneNumber,
  value: string,
) {
  const escaped = value.replace(/[\\%_]/g, (c) => `\\${c}`);
  return sql`${column} LIKE ${`%${escaped}%`} ESCAPE ${"\\"}`;
}

/** SQL for the shared filters. Mirrors `callMatchesFilters` in the domain layer. */
function filterCondition(filters: CallFilters | undefined): SQL | undefined {
  if (!filters) return undefined;
  const conditions: (SQL | undefined)[] = [];

  const search = parseSearch(filters.search);
  if (search) {
    conditions.push(
      or(
        likeContains(calls.conversationId, search.text),
        search.digits ? likeContains(calls.phoneNumber, search.digits) : undefined,
      ),
    );
  }
  if (filters.from) conditions.push(gte(calls.startedAt, new Date(filters.from)));
  if (filters.to) conditions.push(lt(calls.startedAt, new Date(filters.to)));
  return and(...conditions);
}

/** Newest-first page of calls using keyset pagination (stable while new calls arrive). */
export function listCallsPage(db: Db, { limit, after, filters }: CallsPageParams): Call[] {
  const afterCondition = after
    ? or(
        lt(calls.startedAt, after.startedAt),
        and(eq(calls.startedAt, after.startedAt), lt(calls.id, after.id)),
      )
    : undefined;

  return db
    .select()
    .from(calls)
    .where(and(filterCondition(filters), afterCondition))
    .orderBy(desc(calls.startedAt), desc(calls.id))
    .limit(limit)
    .all()
    .map(toCall);
}

export interface CallStats {
  callsToday: number;
  callsThisWeek: number;
  callsLastHour: number;
}

/** Call counts by start time. The ranges come from the browser so they follow the viewer's timezone. */
export function getCallStats(
  db: Db,
  range: { todayStart: Date; weekStart: Date; hourStart: Date },
): CallStats {
  const countSince = (since: Date) =>
    db.select({ n: count() }).from(calls).where(gte(calls.startedAt, since)).get()?.n ?? 0;

  return {
    callsToday: countSince(range.todayStart),
    callsThisWeek: countSince(range.weekStart),
    callsLastHour: countSince(range.hourStart),
  };
}
