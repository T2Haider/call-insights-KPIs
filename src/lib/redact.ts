/**
 * Privacy helpers for anything that is logged. Transcripts and call metadata
 * contain sensitive personal and financial data, so logs must never carry:
 *   - transcript text (any field that may hold message content is redacted by name),
 *   - full recording URLs (presigned links: the query string IS the credential),
 *   - complete phone numbers (also hidden inside conversation ids and file names).
 */

const REDACTED = "[redacted]";

/** Field names whose values may contain message content or whole payloads. */
const SENSITIVE_KEYS = new Set([
  "transcript",
  "message",
  "messages",
  "text",
  "content",
  "body",
  "payload",
  "rawpayload",
  "raw",
]);

/** "+13125550123" -> "+1312***0123" (keeps the start and last four digits). */
export function maskPhone(value: string): string {
  const plus = value.startsWith("+") ? "+" : "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return value;
  return `${plus}${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

/** Removes the query string and fragment from a URL, keeping scheme, host and path. */
export function redactUrl(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

/** Cleans free text: strips URL queries (presigned credentials) and masks phone numbers. */
export function scrubString(input: string): string {
  return input
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactUrl(url))
    .replace(/\+\d{7,15}/g, (match) => maskPhone(match))
    .replace(/(?<!\d)\d{10,15}(?!\d)/g, (match) => `${match.slice(0, 4)}***${match.slice(-4)}`);
}

const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;

/** Deeply sanitizes a log context object. Never throws. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeForLog(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : sanitizeForLog(item, depth + 1),
    ]),
  );
}
