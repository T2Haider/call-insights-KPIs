import { z } from "zod";

export const TranscriptSegmentSchema = z.object({
  speaker: z.string().min(1),
  text: z.string(),
  /** Seconds from the start of the call, when the provider supplies it. */
  timestamp: z.number().min(0).optional(),
});

export const TranscriptSchema = z.array(TranscriptSegmentSchema);

export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;

export const UNKNOWN_SPEAKER = "Unknown";

/**
 * Converts a plain-text transcript into the segment format as one segment.
 * Blank text means "no transcript yet" and returns null.
 */
export function transcriptFromPlainText(text: string): Transcript | null {
  const trimmed = text.trim();
  return trimmed ? [{ speaker: UNKNOWN_SPEAKER, text: trimmed }] : null;
}
