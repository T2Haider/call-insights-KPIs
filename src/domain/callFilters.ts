import type { CallSummaryDto } from "./callDto";

/**
 * Filters shared by the API (applied in SQL) and the browser (applied to live
 * updates, so a pushed call that does not match the active filters is not shown).
 * Keep `callMatchesFilters` and the SQL in `callRepository` in agreement.
 */
export interface CallFilters {
  /** Matches a phone number (digits only, any formatting) or part of a conversation ID. */
  search?: string;
  /** ISO instant, inclusive lower bound on when the call started. */
  from?: string;
  /** ISO instant, exclusive upper bound on when the call started. */
  to?: string;
}

export const MAX_SEARCH_LENGTH = 100;

export interface ParsedSearch {
  /** Lower-cased trimmed text, for conversation ID matching. */
  text: string;
  /** Digits only, for phone matching; empty when the query has no digits. */
  digits: string;
}

export function parseSearch(search: string | undefined): ParsedSearch | null {
  const text = (search ?? "").trim().toLowerCase();
  if (!text) return null;
  return { text, digits: text.replace(/\D/g, "") };
}

export function hasActiveFilters(filters: CallFilters): boolean {
  return Boolean(parseSearch(filters.search) || filters.from || filters.to);
}

export function callMatchesFilters(call: CallSummaryDto, filters: CallFilters): boolean {
  const search = parseSearch(filters.search);
  if (search) {
    const byConversation = call.conversationId.toLowerCase().includes(search.text);
    const byPhone =
      search.digits.length > 0 && call.phoneNumber.replace(/\D/g, "").includes(search.digits);
    if (!byConversation && !byPhone) return false;
  }
  if (filters.from && call.startedAt < new Date(filters.from).toISOString()) return false;
  if (filters.to && call.startedAt >= new Date(filters.to).toISOString()) return false;
  return true;
}
