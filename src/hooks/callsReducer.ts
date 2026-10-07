import type { CallSummaryDto } from "@/domain/callDto";

export type LoadStatus = "loading" | "ready" | "error";

export interface CallsState {
  /** Newest call first (by call start, then id). */
  items: CallSummaryDto[];
  /** Cursor for the next older page, or null when there is no more. */
  nextCursor: string | null;
  /** Ids currently playing the "just arrived / just updated" highlight. */
  highlighted: string[];
  status: LoadStatus;
  loadingMore: boolean;
  error: string | null;
}

/** Which merged calls get the highlight: none (plain loads), new ones only, or any that changed. */
export type HighlightMode = "none" | "new" | "changed";

export type CallsAction =
  /** Filters changed: forget everything and start over. */
  | { type: "reset" }
  | { type: "loadFailed"; error: string }
  /** A page arrived (first page, "load more", or a reconnect refetch). */
  | {
      type: "pageLoaded";
      calls: CallSummaryDto[];
      /** Pass `undefined` to leave the pagination cursor alone (reconnect refetch). */
      nextCursor: string | null | undefined;
      highlight: HighlightMode;
    }
  | { type: "loadMoreStarted" }
  | { type: "loadMoreFailed"; error: string }
  /** A live (SSE) update for a single call. */
  | { type: "merged"; calls: CallSummaryDto[]; highlight: HighlightMode }
  | { type: "highlightCleared"; ids: string[] };

export const initialCallsState: CallsState = {
  items: [],
  nextCursor: null,
  highlighted: [],
  status: "loading",
  loadingMore: false,
  error: null,
};

function compareNewestFirst(a: CallSummaryDto, b: CallSummaryDto): number {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

/**
 * Merges by id and never goes backwards: an incoming call that is older (by
 * updatedAt) than what we hold is ignored, so a slow refetch can never
 * overwrite a fresher live update.
 */
function mergeCalls(state: CallsState, incoming: CallSummaryDto[], highlight: HighlightMode) {
  const byId = new Map(state.items.map((c) => [c.id, c]));
  const flash: string[] = [];

  for (const call of incoming) {
    const existing = byId.get(call.id);
    if (existing && existing.updatedAt >= call.updatedAt) continue;
    byId.set(call.id, call);
    if (highlight === "changed" || (highlight === "new" && !existing)) flash.push(call.id);
  }

  return {
    items: [...byId.values()].sort(compareNewestFirst),
    highlighted: [...new Set([...state.highlighted, ...flash])],
  };
}

/** Pure state transitions for the calls list; free of React so they are unit-tested. */
export function callsReducer(state: CallsState, action: CallsAction): CallsState {
  switch (action.type) {
    case "reset":
      return initialCallsState;

    case "loadFailed":
      // Keep showing what we have; surface the error.
      return { ...state, status: state.items.length > 0 ? "ready" : "error", error: action.error };

    case "pageLoaded":
      return {
        ...state,
        ...mergeCalls(state, action.calls, action.highlight),
        nextCursor: action.nextCursor === undefined ? state.nextCursor : action.nextCursor,
        status: "ready",
        loadingMore: false,
        error: null,
      };

    case "loadMoreStarted":
      return { ...state, loadingMore: true, error: null };

    case "loadMoreFailed":
      return { ...state, loadingMore: false, error: action.error };

    case "merged":
      return {
        ...state,
        ...mergeCalls(state, action.calls, action.highlight),
        status: "ready",
      };

    case "highlightCleared":
      return {
        ...state,
        highlighted: state.highlighted.filter((id) => !action.ids.includes(id)),
      };
  }
}
