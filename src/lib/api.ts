import type { CallDetailDto, CallsPageDto } from "@/domain/callDto";
import type { CallFilters } from "@/domain/callFilters";
import type { IngestionStatusDto } from "@/services/ingestionStatus";
import type { SummaryDto } from "@/services/summaryService";

/** An API failure that keeps the HTTP status, so callers can tell "not found" from "server error". */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Browser-side API client. Throws `ApiError` with a readable message on any failure. */
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `Request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

/**
 * Builds the query string for the calls list. URLSearchParams percent-encodes
 * every value, which matters: conversation ids contain "+" and "_", and an
 * unencoded "+" in a query string is decoded by servers as a space.
 */
export function buildCallsQuery(params: {
  limit?: number;
  cursor?: string | null;
  filters?: CallFilters;
}): string {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  const { filters } = params;
  if (filters?.search?.trim()) search.set("search", filters.search.trim());
  if (filters?.from) search.set("from", filters.from);
  if (filters?.to) search.set("to", filters.to);
  return search.toString();
}

export function fetchCallsPage(
  params: { limit?: number; cursor?: string | null; filters?: CallFilters },
  signal?: AbortSignal,
) {
  return getJson<CallsPageDto>(`/api/calls?${buildCallsQuery(params)}`, signal);
}

export const fetchCall = (id: string, signal?: AbortSignal) =>
  getJson<CallDetailDto>(`/api/calls/${encodeURIComponent(id)}`, signal);

export const fetchIngestionStatus = () => getJson<IngestionStatusDto>("/api/status");

export function fetchSummary(range: { todayStart: Date; weekStart: Date }) {
  const search = new URLSearchParams({
    todayStart: range.todayStart.toISOString(),
    weekStart: range.weekStart.toISOString(),
  });
  return getJson<SummaryDto>(`/api/summary?${search}`);
}
