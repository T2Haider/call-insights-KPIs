import type { NormalizedCallInput } from "@/domain/call";
import { transcriptFromPlainText, UNKNOWN_SPEAKER, type Transcript } from "@/domain/transcript";
import { ConfigurationError } from "@/lib/errors";
import { toE164 } from "@/lib/phone";
import type { CallNormalizer } from "../types";
import { WebhookPayloadSchema, type WebhookPayload } from "./payload";

export const WEBHOOK_PROVIDER_NAME = "webhook";

export interface WebhookNormalizerOptions {
  defaultPhoneRegion: string;
  /** Prefix for recording paths that are not already full URLs. */
  recordingBaseUrl?: string;
}

/**
 * Turns the sender's payload into our normalized call. Recording links are
 * opaque presigned URLs: stored untouched and displayed, never fetched. They
 * expire; a fresh link can be minted later via `refreshRecordingUrl`.
 */
export function createWebhookNormalizer(options: WebhookNormalizerOptions): CallNormalizer {
  return {
    name: WEBHOOK_PROVIDER_NAME,

    normalize(raw: unknown): NormalizedCallInput {
      const payload = WebhookPayloadSchema.parse(raw);

      const phoneNumber = toE164(payload.phone_number, options.defaultPhoneRegion);
      if (!phoneNumber) throw new Error("phone_number is not a valid phone number");

      return {
        conversationId: payload.conversation_id,
        phoneNumber,
        // The sender's single timestamp is the call start (see payload.ts).
        startedAt: payload.timestamp,
        endedAt: payload.ended_at ?? null,
        durationSeconds:
          payload.duration_seconds == null ? null : Math.round(payload.duration_seconds),
        recordingUrl: resolveRecordingUrl(payload.call_recording_path, options.recordingBaseUrl),
        transcript: normalizeTranscript(payload.transcript),
        failed: false,
        rawPayload: raw,
      };
    },
  };
}

/**
 * Empty or missing means "not ready yet" (null). A full URL is returned
 * EXACTLY as sent: presigned links are signed over their exact text, so it must
 * never be re-encoded or reordered.
 */
export function resolveRecordingUrl(
  path: string | null | undefined,
  baseUrl: string | undefined,
): string | null {
  const value = path?.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      new URL(value); // validation only
    } catch {
      throw new Error("call_recording_path is not a valid URL");
    }
    return value;
  }
  if (!baseUrl) {
    throw new ConfigurationError(
      "call_recording_path is an object path but RECORDING_BASE_URL is not configured",
    );
  }
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(value.replace(/^\/+/, ""), base).href;
}

/**
 * role -> speaker, message -> text, kept exactly as received: no trimming,
 * merging or editing, so line breaks and cut-off sentences survive. A transcript
 * with no actual text counts as not available yet (null).
 */
function normalizeTranscript(transcript: WebhookPayload["transcript"]): Transcript | null {
  if (transcript === null || transcript === undefined) return null;
  if (typeof transcript === "string") return transcriptFromPlainText(transcript);
  if (transcript.every((m) => m.message.trim() === "")) return null;
  return transcript.map((m) => ({
    speaker: m.role && m.role.trim() !== "" ? m.role : UNKNOWN_SPEAKER,
    text: m.message,
  }));
}
