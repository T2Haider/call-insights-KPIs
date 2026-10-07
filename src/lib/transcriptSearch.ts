import type { Transcript } from "@/domain/transcript";

export interface TextPart {
  text: string;
  match: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Splits `text` into alternating plain / matching parts for highlighting.
 * Matching is a literal, case-insensitive substring search (the query is never
 * treated as a pattern). The original text is returned unchanged, only cut up,
 * so rendering the parts in order reproduces it exactly.
 */
export function splitByQuery(text: string, query: string): TextPart[] {
  const needle = query.trim();
  if (!needle) return [{ text, match: false }];

  const parts: TextPart[] = [];
  let cursor = 0;
  for (const found of text.matchAll(new RegExp(escapeRegExp(needle), "gi"))) {
    const start = found.index;
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });
    parts.push({ text: found[0], match: true });
    cursor = start + found[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}

/** Number of occurrences of the query in the text. */
export function countMatches(text: string, query: string): number {
  return splitByQuery(text, query).filter((p) => p.match).length;
}

/** Indices of the transcript messages that contain the query, in order. */
export function matchingMessageIndices(transcript: Transcript, query: string): number[] {
  if (!query.trim()) return [];
  return transcript.flatMap((segment, index) =>
    countMatches(segment.text, query) > 0 ? [index] : [],
  );
}

/** Total occurrences across the whole transcript. */
export function totalMatches(transcript: Transcript, query: string): number {
  if (!query.trim()) return 0;
  return transcript.reduce((sum, segment) => sum + countMatches(segment.text, query), 0);
}
