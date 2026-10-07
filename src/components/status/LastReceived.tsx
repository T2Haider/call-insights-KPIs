"use client";

import type { IngestionStatusView } from "@/hooks/useCalls";
import { useNow } from "@/hooks/useNow";
import { formatAgeLong } from "@/lib/format";

/**
 * "Last call received: 4 minutes ago". Age = time since the server last
 * accepted a call, measured on the server clock plus how long ago we heard it,
 * so a wrong browser clock cannot skew it. Quiet periods are normal, so this
 * is informational, never an error.
 */
export function LastReceived({ ingestion }: { ingestion: IngestionStatusView | null }) {
  const now = useNow();

  if (!ingestion) return null;
  const { status, receivedAt } = ingestion;
  if (!status.lastReceivedAt) {
    return <span className="text-sm text-muted-foreground">No calls received yet</span>;
  }

  const ageAtReceipt =
    (new Date(status.serverTime).getTime() - new Date(status.lastReceivedAt).getTime()) / 1000;
  const age = ageAtReceipt + (now - receivedAt) / 1000;

  return (
    <span className="text-sm text-muted-foreground">
      Last call received: <span className="tabular-nums">{formatAgeLong(age)}</span>
    </span>
  );
}
