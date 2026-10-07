import { z } from "zod";

/**
 * ============================================================================
 *  THE WEBHOOK PAYLOAD CONTRACT: the only file that knows the sender's format.
 * ============================================================================
 * If the sender's JSON differs from what is described here, change THIS file and
 * `normalizer.ts` (plus docs/WEBHOOK_SPEC.md); nothing else in the app moves.
 *
 * Shape (from a sample provided by the sender; values here are fake):
 *   {
 *     "phone_number": "+13125550123",
 *     "transcript": [ { "role": "agent", "message": "..." }, { "role": "user", "message": "..." } ],
 *     "timestamp": 1791309411,                      // Unix seconds
 *     "conversation_id": "call-_+13125550123_AbCdEf123456",
 *     "call_recording_path": "https://minio.example.com/bucket/recordings/....wav?X-Amz-Signature=..."
 *   }
 *
 * Decisions that are NOT yet confirmed by the sender:
 *   - `timestamp` is treated as when the call STARTED (there is no end time or duration).
 *     If that turns out wrong, only `normalizer.ts` needs to change.
 *   - `ended_at` and `duration_seconds` do not exist today. They are accepted if the sender
 *     adds them later, and nothing else needs to change.
 *
 * Notes:
 *   - `transcript` and `call_recording_path` may be missing, null or empty on an early
 *     send: the call then stays "processing" until a later send includes them.
 *   - Transcript messages are kept EXACTLY as received (line breaks, cut-off sentences).
 *   - `conversation_id` contains characters like "+" and "_": always URL-encode it in URLs.
 *   - `call_recording_path` is a presigned link that expires. Store it untouched.
 *   - Unknown extra fields are ignored (but kept in `rawPayload`).
 */

/** A Unix timestamp (seconds, or milliseconds) or an ISO-8601 string. */
const DateLikeSchema = z
  .union([z.string().min(1), z.number()], {
    error: "is required: a Unix timestamp (seconds) or an ISO-8601 date-time",
  })
  .transform((value, ctx) => {
    const date =
      typeof value === "number" ? new Date(value < 1e11 ? value * 1000 : value) : new Date(value);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "must be a Unix timestamp (seconds) or an ISO-8601 date-time",
      });
      return z.NEVER;
    }
    return date;
  });

const TranscriptMessageSchema = z.object({
  /** "agent" or "user" today; unknown roles are kept and shown as-is. */
  role: z.string().nullish(),
  /** Deliberately not trimmed or otherwise altered. */
  message: z.string(),
});

export const WebhookPayloadSchema = z.object({
  conversation_id: z.string().trim().min(1).max(200),
  phone_number: z.string().trim().min(1).max(40),
  /** When the call started. */
  timestamp: DateLikeSchema,
  /** A plain string is also tolerated, in case the sender ever sends one. */
  transcript: z.union([z.string(), z.array(TranscriptMessageSchema)]).nullish(),
  call_recording_path: z.string().trim().max(4000).nullish(),
  /** Not sent today; used automatically if the sender adds them. */
  ended_at: DateLikeSchema.nullish(),
  duration_seconds: z.number().min(0).nullish(),
});

export type WebhookPayload = z.output<typeof WebhookPayloadSchema>;
export type WebhookTranscriptMessage = z.output<typeof TranscriptMessageSchema>;
