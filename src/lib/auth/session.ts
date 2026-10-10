import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";

/**
 * The signed-in session for this request, or null (ARCH-04 step 1). It reads
 * request headers, so with Cache Components call it inside a Suspense
 * boundary, never at the top of a layout.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
