import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { ingestionState } from "./schema";

export interface IngestionState {
  provider: string;
  lastReceivedAt: Date | null;
  lastRejectedAt: Date | null;
  lastRejectReason: string | null;
}

export function getIngestionState(db: Db, provider: string): IngestionState {
  const row = db.select().from(ingestionState).where(eq(ingestionState.provider, provider)).get();
  return row ?? { provider, lastReceivedAt: null, lastRejectedAt: null, lastRejectReason: null };
}

/** A call was accepted (including a harmless duplicate). */
export function recordCallReceived(db: Db, provider: string, now: Date = new Date()): void {
  db.insert(ingestionState)
    .values({ provider, lastReceivedAt: now })
    .onConflictDoUpdate({ target: ingestionState.provider, set: { lastReceivedAt: now } })
    .run();
}

/** A request was turned away (401, 400, 413...). The reason is shown to operators. */
export function recordRequestRejected(
  db: Db,
  provider: string,
  reason: string,
  now: Date = new Date(),
): void {
  db.insert(ingestionState)
    .values({ provider, lastRejectedAt: now, lastRejectReason: reason })
    .onConflictDoUpdate({
      target: ingestionState.provider,
      set: { lastRejectedAt: now, lastRejectReason: reason },
    })
    .run();
}
