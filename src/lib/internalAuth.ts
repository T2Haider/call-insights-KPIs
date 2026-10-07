import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time secret comparison (hashing first makes the buffers equal length). */
export function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
