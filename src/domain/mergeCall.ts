import type { Call, ValidatedCallInput } from "./call";
import { deriveStatus } from "./status";

/** Everything the repository persists for a call, minus ids and bookkeeping timestamps. */
export type CallWrite = Omit<Call, "id" | "createdAt" | "updatedAt">;

/** True when two versions of a call hold the same information (the raw payload is not compared). */
export function sameCallContent(a: Call, b: Omit<CallWrite, "rawPayload">): boolean {
  return (
    a.provider === b.provider &&
    a.phoneNumber === b.phoneNumber &&
    a.startedAt.getTime() === b.startedAt.getTime() &&
    a.endedAt?.getTime() === b.endedAt?.getTime() &&
    a.durationSeconds === b.durationSeconds &&
    a.recordingUrl === b.recordingUrl &&
    a.status === b.status &&
    JSON.stringify(a.transcript) === JSON.stringify(b.transcript)
  );
}

/**
 * Pure function: combines a validated incoming record with what we already
 * stored (if anything) into the row to save.
 *
 * Merge rule: data only moves forward. A later copy of the same call that
 * carries null for the recording or transcript (or no duration) never erases
 * what we already have, and never replaces a richer raw payload with a poorer
 * one. That is what lets an early, incomplete copy be completed later, and
 * keeps re-sending the same call idempotent. A newer NON-null value does
 * replace the old one.
 */
export function buildCallWrite(params: {
  existing: Call | null;
  input: ValidatedCallInput;
  provider: string;
  now: Date;
  processingTimeoutMs: number;
}): CallWrite {
  const { existing, input, provider, now, processingTimeoutMs } = params;

  const recordingUrl = input.recordingUrl ?? existing?.recordingUrl ?? null;
  const transcript = input.transcript ?? existing?.transcript ?? null;

  // End time and duration are optional. Use what this copy reports, derive one from the other,
  // and otherwise keep what we already know (data only moves forward).
  const durationSeconds =
    input.durationSeconds ??
    (input.endedAt
      ? Math.max(0, Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000))
      : (existing?.durationSeconds ?? null));
  const endedAt =
    input.endedAt ??
    (input.durationSeconds != null
      ? new Date(input.startedAt.getTime() + input.durationSeconds * 1000)
      : (existing?.endedAt ?? null));

  const merged: Omit<CallWrite, "rawPayload"> = {
    conversationId: input.conversationId,
    provider,
    phoneNumber: input.phoneNumber,
    startedAt: input.startedAt,
    endedAt,
    durationSeconds,
    recordingUrl,
    transcript,
    status: deriveStatus(
      { failed: input.failed, recordingUrl, transcript, since: existing?.createdAt ?? now },
      now,
      processingTimeoutMs,
    ),
  };

  // If this copy adds nothing, keep the payload we already have (it may be the richer one).
  const rawPayload =
    existing && sameCallContent(existing, merged)
      ? existing.rawPayload
      : (input.rawPayload ?? null);

  return { ...merged, rawPayload };
}
