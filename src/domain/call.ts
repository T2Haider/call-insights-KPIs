import { z } from "zod";
import { TranscriptSchema, type Transcript } from "./transcript";

export const CALL_STATUSES = ["processing", "completed", "failed"] as const;
export const CallStatusSchema = z.enum(CALL_STATUSES);
export type CallStatus = z.infer<typeof CallStatusSchema>;

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * What a provider adapter must produce for each call. This is the contract
 * between adapters and the rest of the app; ingestion validates it with Zod
 * before anything is saved. Status is NOT part of it: the app derives it.
 */
export const NormalizedCallInputSchema = z
  .object({
    conversationId: z.string().min(1),
    phoneNumber: z.string().regex(E164_REGEX, "phoneNumber must be E.164"),
    /** When the call started. The one timestamp every sender provides. */
    startedAt: z.coerce.date(),
    /** Optional: not every sender reports when a call ended. */
    endedAt: z.coerce.date().nullish(),
    /** Optional: derived from endedAt when only that is given; unknown otherwise. */
    durationSeconds: z.number().int().min(0).nullish(),
    recordingUrl: z.url().nullable(),
    transcript: TranscriptSchema.nullable(),
    /** True when the provider reports the call/recording/transcript as failed. */
    failed: z.boolean().default(false),
    rawPayload: z.unknown(),
  })
  .refine((c) => !c.endedAt || c.endedAt >= c.startedAt, {
    message: "endedAt must not be before startedAt",
    path: ["endedAt"],
  });

/** What adapters return (before validation). */
export type NormalizedCallInput = z.input<typeof NormalizedCallInputSchema>;
/** What ingestion works with (after validation, defaults applied). */
export type ValidatedCallInput = z.output<typeof NormalizedCallInputSchema>;

/** The normalized call used everywhere in the app (DB rows, API, UI). */
export interface Call {
  id: string;
  conversationId: string;
  /** Provider that produced this call (supports multiple providers later). */
  provider: string;
  /** E.164, e.g. +14155550123. Format for display with `formatPhoneForDisplay`. */
  phoneNumber: string;
  /** Call start. Used for sorting, date filters, summaries and retention. */
  startedAt: Date;
  /** Null when the sender does not report it (shown as a dash). */
  endedAt: Date | null;
  /** Null when unknown (shown as a dash). */
  durationSeconds: number | null;
  /** Opaque URL (may be a presigned MinIO link). Null until available. */
  recordingUrl: string | null;
  /** Null until available. */
  transcript: Transcript | null;
  status: CallStatus;
  /** Original provider data, kept for debugging. */
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
}
