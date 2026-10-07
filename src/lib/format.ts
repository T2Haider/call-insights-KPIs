/** "45s", "4m 32s", "1h 02m". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "Oct 6, 10:42 AM" in the viewer's locale and timezone. */
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "1 minute ago", "3 hours ago": the long form used in the header. */
export function formatAgeLong(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;
  if (s < 3600) return plural(Math.floor(s / 60), "minute");
  if (s < 86_400) return plural(Math.floor(s / 3600), "hour");
  return plural(Math.floor(s / 86_400), "day");
}

/** Duration for display; a dash when the sender did not report one. */
export function formatCallDuration(totalSeconds: number | null): string {
  return totalSeconds === null ? "—" : formatDuration(totalSeconds);
}

/** Full date and time with seconds, in the viewer's locale and timezone. */
export function formatFullDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" }).format(
    new Date(iso),
  );
}

/** Time for display; a dash when missing. */
export function formatOptionalDateTime(iso: string | null): string {
  return iso === null ? "—" : formatDateTime(iso);
}

/** "just now", "12s ago", "3m ago", "2h ago". */
export function formatAge(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 3) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

/** "conv_c815f3…aa9" style shortening for long ids. */
export function truncateMiddle(value: string, head = 10, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Midnight at the start of `date`'s day in the viewer's local timezone. */
export function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Midnight at the start of the Monday of `date`'s week, in the viewer's local timezone. */
export function startOfLocalWeek(date: Date): Date {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/**
 * Converts <input type="date"> values (YYYY-MM-DD, local days) into the API's
 * instants: `from` = start of that day, `to` = start of the day AFTER the end
 * date (exclusive), so the end date is fully included.
 */
export function dateInputsToRange(
  fromDate: string,
  toDate: string,
): { from?: string; to?: string } {
  const parse = (value: string): Date | null => {
    const [y, m, d] = value.split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  };
  const from = fromDate ? parse(fromDate) : null;
  const to = toDate ? parse(toDate) : null;
  if (to) to.setDate(to.getDate() + 1);
  return { from: from?.toISOString(), to: to?.toISOString() };
}
