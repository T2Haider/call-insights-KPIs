import type { Db } from "@/db/client";
import { getIngestionState } from "@/db/ingestionStateRepository";

/** A rejection stops being shown after this long, or as soon as a call is accepted after it. */
export const REJECTION_VISIBLE_MS = 15 * 60 * 1000;

export interface IngestionStatusDto {
  provider: string;
  /** When the last call was accepted, or null if none yet. A quiet spell is normal, not an error. */
  lastReceivedAt: string | null;
  /** A webhook request was turned away recently (e.g. wrong secret) and nothing succeeded since. */
  recentRejection: { at: string; reason: string } | null;
  /** Server clock, so browsers can show "N minutes ago" without clock-skew errors. */
  serverTime: string;
}

export function getIngestionStatus(
  db: Db,
  params: { provider: string; now?: Date },
): IngestionStatusDto {
  const now = params.now ?? new Date();
  const state = getIngestionState(db, params.provider);

  const rejectedAt = state.lastRejectedAt;
  const showRejection =
    rejectedAt !== null &&
    state.lastRejectReason !== null &&
    now.getTime() - rejectedAt.getTime() <= REJECTION_VISIBLE_MS &&
    (state.lastReceivedAt === null || rejectedAt > state.lastReceivedAt);

  return {
    provider: params.provider,
    lastReceivedAt: state.lastReceivedAt?.toISOString() ?? null,
    recentRejection:
      showRejection && rejectedAt && state.lastRejectReason
        ? { at: rejectedAt.toISOString(), reason: state.lastRejectReason }
        : null,
    serverTime: now.toISOString(),
  };
}
