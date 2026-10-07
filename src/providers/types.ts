import type { NormalizedCallInput } from "@/domain/call";

/**
 * The seam between a call data source and the rest of the app. Calls arrive by
 * webhook, so all ingestion needs is a way to turn one raw payload into the
 * normalized shape. To support another sender later (a second webhook format,
 * a polling source), implement this and call `ingestCall` with it; the domain,
 * database, SSE and UI stay untouched.
 */
export interface CallNormalizer {
  /** Stable identifier stored on each call, e.g. "webhook". */
  readonly name: string;

  /**
   * Converts ONE raw record into the normalized shape (E.164 phone, transcript
   * segments, Date timestamps, a playable recording URL, `rawPayload` set to the
   * original). Throw a plain `Error` for bad data (the sender gets a 400) and
   * `ConfigurationError` when OUR configuration is at fault (the sender gets a 500).
   */
  normalize(raw: unknown): NormalizedCallInput;

  /**
   * Optional, for later: returns a fresh presigned recording link on demand when a
   * stored one has expired (the dashboard shows "Recording link may have expired").
   * Nothing calls it yet; the detail view and an API route would use it.
   */
  refreshRecordingUrl?(conversationId: string): Promise<string>;
}
