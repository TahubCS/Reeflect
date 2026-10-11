import { redirect } from "next/navigation";
import { Suspense } from "react";
import { personalWorkspaceHref } from "@/lib/auth/home";
import { PageLoading } from "./page-loading";

async function Go({ path }: { path: `/${string}` }): Promise<never> {
  redirect(await personalWorkspaceHref(path));
}

/**
 * A workspace-free URL such as /dashboard, kept for bookmarks and for links
 * that do not know the workspace yet: opens `path` in the signed-in user's
 * Personal workspace (ADR-007). Finding that workspace reads the session,
 * so it happens inside a Suspense boundary.
 */
export function PersonalWorkspaceRedirect({ path }: { path: `/${string}` }) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Go path={path} />
    </Suspense>
  );
}
