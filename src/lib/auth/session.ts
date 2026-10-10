import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";

/**
 * The signed-in session for this request, or null (ARCH-04 step 1). It reads
 * request headers, so with Cache Components call it inside a Suspense
 * boundary, never at the top of a layout. Cached per request, so several
 * components can call it and share one lookup.
 */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
