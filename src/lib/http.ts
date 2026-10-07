/** Consistent JSON error body for every API route: `{ "error": "message" }`. */
export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}
