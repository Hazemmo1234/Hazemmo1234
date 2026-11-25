import { timingSafeEqual } from "node:crypto";

/** Constant-time TV key comparison (SYSTEM_ARCHITECTURE "Security", D3). */
export function tvKeyMatches(provided: string | null | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
