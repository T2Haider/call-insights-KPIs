"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { detailToSummary } from "@/domain/callDto";
import { callMatchesFilters, type CallFilters } from "@/domain/callFilters";
import type { CallEvent } from "@/events/types";
import { fetchCall, fetchCallsPage } from "@/lib/api";
import type { IngestionStatusDto } from "@/services/ingestionStatus";
import { callsReducer, initialCallsState, type HighlightMode } from "./callsReducer";
import { useEventStream } from "./useEventStream";

const PAGE_SIZE = 25;
const HIGHLIGHT_MS = 3000;

export interface IngestionStatusView {
  status: IngestionStatusDto;
  /** `Date.now()` when we received it; with `status.serverTime` this gives skew-free ages. */
  receivedAt: number;
}

/**
 * Owns the calls list for the given filters: loads it, merges live SSE updates
 * that match the filters, paginates, and refetches the latest calls after every
 * reconnect so nothing is missed.
 */
export function useCalls(filters: CallFilters) {
  const [state, dispatch] = useReducer(callsReducer, initialCallsState);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatusView | null>(null);
  /** Bumps on every change notification; the summary cards refetch when it moves. */
  const [changeVersion, setChangeVersion] = useState(0);

  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const filtersRef = useRef(filters);
  const cursorRef = useRef<string | null>(null);
  /** Guards against responses for filters the user has since changed. */
  const generation = useRef(0);

  useEffect(() => {
    filtersRef.current = filters;
  });
  useEffect(() => {
    cursorRef.current = state.nextCursor;
  }, [state.nextCursor]);

  const scheduleHighlightClear = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      dispatch({ type: "highlightCleared", ids });
    }, HIGHLIGHT_MS);
    timers.current.add(timer);
  }, []);

  /** First page (or the latest page again after a reconnect). */
  const loadLatest = useCallback(
    async (highlight: HighlightMode, keepCursor: boolean) => {
      const mine = generation.current;
      try {
        const page = await fetchCallsPage({ limit: PAGE_SIZE, filters: filtersRef.current });
        if (mine !== generation.current) return;
        dispatch({
          type: "pageLoaded",
          calls: page.items,
          nextCursor: keepCursor ? undefined : page.nextCursor,
          highlight,
        });
        if (highlight !== "none") scheduleHighlightClear(page.items.map((c) => c.id));
      } catch (error) {
        if (mine !== generation.current) return;
        dispatch({
          type: "loadFailed",
          error: error instanceof Error ? error.message : "Failed to load calls",
        });
      }
    },
    [scheduleHighlightClear],
  );

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor) return;
    const mine = generation.current;
    dispatch({ type: "loadMoreStarted" });
    try {
      const page = await fetchCallsPage({
        limit: PAGE_SIZE,
        cursor,
        filters: filtersRef.current,
      });
      if (mine !== generation.current) return;
      dispatch({
        type: "pageLoaded",
        calls: page.items,
        nextCursor: page.nextCursor,
        highlight: "none",
      });
    } catch (error) {
      if (mine !== generation.current) return;
      dispatch({
        type: "loadMoreFailed",
        error: error instanceof Error ? error.message : "Failed to load more calls",
      });
    }
  }, []);

  const onCall = useCallback(
    async (event: CallEvent) => {
      setChangeVersion((v) => v + 1);
      if (event.type === "call.created") {
        // A call just arrived: reflect it in "Last call received" now, not at the next 5 s status tick.
        const nowIso = new Date().toISOString();
        setIngestionStatus((prev) => ({
          status: {
            provider: prev?.status.provider ?? "webhook",
            lastReceivedAt: nowIso,
            recentRejection: null,
            serverTime: nowIso,
          },
          receivedAt: Date.now(),
        }));
      }
      const mine = generation.current;
      try {
        const call = detailToSummary(await fetchCall(event.callId));
        // Ignore calls outside the active search / date filters.
        if (mine !== generation.current || !callMatchesFilters(call, filtersRef.current)) return;
        dispatch({ type: "merged", calls: [call], highlight: "changed" });
        scheduleHighlightClear([call.id]);
      } catch {
        // The next reconnect or reload will pick it up; nothing user-facing to do.
      }
    },
    [scheduleHighlightClear],
  );

  const connection = useEventStream("/api/events", {
    onCall: (event) => void onCall(event),
    onStatus: (status) => setIngestionStatus({ status, receivedAt: Date.now() }),
    onReconnect: () => {
      setChangeVersion((v) => v + 1);
      void loadLatest("new", true);
    },
  });

  // (Re)load whenever the filters change.
  const filtersKey = JSON.stringify([filters.search?.trim() ?? "", filters.from, filters.to]);
  useEffect(() => {
    generation.current += 1;
    dispatch({ type: "reset" });
    void loadLatest("none", false);
  }, [filtersKey, loadLatest]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  return {
    ...state,
    connection,
    ingestionStatus,
    changeVersion,
    loadMore,
    reload: () => {
      generation.current += 1;
      dispatch({ type: "reset" });
      void loadLatest("none", false);
    },
  };
}
