import type { CallStatus } from "./call";
import type { Transcript } from "./transcript";

export interface StatusInputs {
  failed: boolean;
  recordingUrl: string | null;
  transcript: Transcript | null;
  /** When we started waiting for this call's data (normally when we first received it). */
  since: Date;
}

/**
 * Derives the call status:
 *  - failed:     provider says so, or still incomplete `timeoutMs` after `since`
 *  - completed:  recording link AND transcript both available
 *  - processing: otherwise
 */
export function deriveStatus(input: StatusInputs, now: Date, timeoutMs: number): CallStatus {
  if (input.failed) return "failed";
  if (input.recordingUrl && input.transcript) return "completed";
  return now.getTime() - input.since.getTime() > timeoutMs ? "failed" : "processing";
}
