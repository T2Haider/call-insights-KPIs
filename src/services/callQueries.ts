import { findCallById, listCallsPage } from "@/db/callRepository";
import type { Db } from "@/db/client";
import type { CallFilters } from "@/domain/callFilters";
import {
  toCallDetailDto,
  toCallSummaryDto,
  type CallDetailDto,
  type CallsPageDto,
} from "@/domain/callDto";

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid cursor");
    this.name = "InvalidCursorError";
  }
}

/** Cursors are opaque to clients: base64url of "<startedAtMs>.<id>". */
export function encodeCursor(startedAt: Date, id: string): string {
  return Buffer.from(`${startedAt.getTime()}.${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { startedAt: Date; id: string } {
  const decoded = Buffer.from(cursor, "base64url").toString();
  const dot = decoded.indexOf(".");
  const ms = Number(decoded.slice(0, dot));
  const id = decoded.slice(dot + 1);
  if (dot < 1 || !Number.isFinite(ms) || !id) throw new InvalidCursorError();
  return { startedAt: new Date(ms), id };
}

export function listCalls(
  db: Db,
  params: { limit?: number; cursor?: string | null; filters?: CallFilters },
): CallsPageDto {
  const limit = Math.min(Math.max(params.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const after = params.cursor ? decodeCursor(params.cursor) : undefined;

  // Fetch one extra row to know whether another page exists.
  const rows = listCallsPage(db, { limit: limit + 1, after, filters: params.filters });
  const page = rows.slice(0, limit);
  const last = page.at(-1);

  return {
    items: page.map(toCallSummaryDto),
    nextCursor: rows.length > limit && last ? encodeCursor(last.startedAt, last.id) : null,
  };
}

export function getCallDetail(db: Db, id: string): CallDetailDto | null {
  const call = findCallById(db, id);
  return call ? toCallDetailDto(call) : null;
}
