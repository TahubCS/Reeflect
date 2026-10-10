import { redirect } from "next/navigation";
import { personalWorkspaceHref } from "@/lib/auth/home";

// The workspace-free URL, kept for bookmarks: opens this page in the
// signed-in user's Personal workspace (ADR-007).
export default async function Page() {
  redirect(await personalWorkspaceHref("/bills"));
}
