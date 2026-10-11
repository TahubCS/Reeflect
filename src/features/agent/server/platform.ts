import "server-only";
import type { Platform } from "@reeflect/agent-protocol";
import { env } from "@/lib/env";

/**
 * Whether the app takes turns from `platform` where it is running. The
 * `terminal` platform is Spectrum's development chat: its handles are not
 * phone numbers anyone has proven they own, so a deployment refuses it.
 */
export function platformAllowed(
  platform: Platform,
  deployed: boolean = env.VERCEL !== undefined,
): boolean {
  return platform !== "terminal" || !deployed;
}
