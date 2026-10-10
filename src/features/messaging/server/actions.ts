"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { ensurePersonalWorkspace } from "@/lib/auth/personal-workspace";
import { getSession } from "@/lib/auth/session";
import {
  type NewLinkCode,
  approveLink,
  createLinkCode,
  rejectLink,
  revokeForUser,
  setProactiveOptIn,
} from "./link";

// Server actions for the Settings card (ARCH-04). Each one works on the
// signed-in user's own phone link; the client supplies only the workspace
// id from the URL, which must be that user's Personal workspace (ADR-034).

async function requireOwnPersonalWorkspace(
  workspaceId: unknown,
): Promise<{ userId: string; workspaceId: string }> {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "owner");
  // `requireWorkspaceAccess` has already refused a missing session.
  const userId = session!.user.id;
  if ((await ensurePersonalWorkspace(userId)) !== access.workspaceId) {
    notFound();
  }
  return { userId, workspaceId: access.workspaceId };
}

export async function createLinkCodeAction(
  workspaceId: string,
): Promise<NewLinkCode> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  const result = await createLinkCode(userId);
  refresh();
  return result;
}

/** False when the request had expired or the phone was linked elsewhere. */
export async function approveLinkAction(workspaceId: string): Promise<boolean> {
  const own = await requireOwnPersonalWorkspace(workspaceId);
  const linked = await approveLink(own.userId, own.workspaceId);
  refresh();
  return linked;
}

export async function rejectLinkAction(workspaceId: string): Promise<void> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  await rejectLink(userId);
  refresh();
}

export async function disconnectAction(workspaceId: string): Promise<void> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  await revokeForUser(userId);
  refresh();
}

export async function setProactiveOptInAction(
  workspaceId: string,
  optIn: boolean,
): Promise<void> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  await setProactiveOptIn(userId, z.boolean().parse(optIn));
  refresh();
}
