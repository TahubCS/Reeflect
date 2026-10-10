import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const sha256 = (value: string): Buffer =>
  createHash("sha256").update(value).digest();

/**
 * Whether an `Authorization` header carries the worker's service token
 * (ADR-032). Always false when no token is configured. Both sides are
 * hashed first, so the comparison takes the same time for any input.
 */
export function hasServiceToken(
  authorization: string | null,
  expected: string | undefined = env.AGENT_SERVICE_TOKEN,
): boolean {
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  const presented = authorization.slice("Bearer ".length);
  return timingSafeEqual(sha256(presented), sha256(expected));
}
