/** Reads one query parameter from a `location.search` string. Null when absent or empty. */
export function readParam(search: string, name: string): string | null {
  const value = new URLSearchParams(search).get(name);
  return value ? value : null;
}

/**
 * Returns `pathname + search + hash` with one query parameter set (or removed
 * when `value` is null), leaving the other parameters alone. URLSearchParams
 * percent-encodes the value, which matters for ids containing "+" or "_".
 */
export function withParam(
  location: { pathname: string; search: string; hash: string },
  name: string,
  value: string | null,
): string {
  const params = new URLSearchParams(location.search);
  if (value === null) params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
}
