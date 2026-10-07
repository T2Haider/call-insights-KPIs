import { getCallStats } from "@/db/callRepository";
import type { Db } from "@/db/client";

const HOUR_MS = 60 * 60 * 1000;

export interface SummaryDto {
  callsToday: number;
  callsThisWeek: number;
  callsLastHour: number;
}

/**
 * Dashboard summary cards, counting calls by when they started. "Today" and
 * "this week" begin at instants the BROWSER supplies (start of its local day,
 * and of its local Monday), so the numbers match the viewer's timezone.
 */
export function getSummary(
  db: Db,
  params: { todayStart: Date; weekStart: Date; now?: Date },
): SummaryDto {
  const now = params.now ?? new Date();
  return getCallStats(db, {
    todayStart: params.todayStart,
    weekStart: params.weekStart,
    hourStart: new Date(now.getTime() - HOUR_MS),
  });
}
