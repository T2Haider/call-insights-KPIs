"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSummary } from "@/lib/api";
import { startOfLocalDay, startOfLocalWeek } from "@/lib/format";
import type { SummaryDto } from "@/services/summaryService";

const REFRESH_MS = 60_000; // "last hour" slides even when no new calls arrive
const DEBOUNCE_MS = 400; // collapse bursts of change events into one request

/** Summary cards data. Refetches when `changeVersion` moves, and once a minute. */
export function useSummary(changeVersion: number) {
  const [data, setData] = useState<SummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      setData(
        await fetchSummary({ todayStart: startOfLocalDay(now), weekStart: startOfLocalWeek(now) }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load summary");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), changeVersion === 0 ? 0 : DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [changeVersion, load]);

  useEffect(() => {
    const interval = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(interval);
  }, [load]);

  return { data, error, retry: load };
}
