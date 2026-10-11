"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { APP_NAME } from "@/config/app";
import { ownPersonalWorkspace } from "./access";
import {
  type NewLinkCode,
  approveLink,
  createLinkCode,
  rejectLink,
  revokeForUser,
  setProactiveOptIn,
} from "./link";
import { sendToPhone } from "./notify";

// Server actions for the Settings card (ARCH-04). Each one works on the
// signed-in user's own phone link; the client supplies only the workspace
// id from the URL, which must be that user's Personal workspace (ADR-034).

async function requireOwnPersonalWorkspace(
  workspaceId: unknown,
): Promise<{ userId: string; workspaceId: string }> {
  return (await ownPersonalWorkspace(workspaceId)) ?? notFound();
}

export async function createLinkCodeAction(
  workspaceId: string,
): Promise<NewLinkCode> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  const result = await createLinkCode(userId);
  refresh();
  return result;
}

/**
 * What the phone is told once it is linked. It confirms what the user just
 * did, so it is not a proactive message (ADR-062); it carries no amounts.
 */
const LINKED_TEXT = `You're linked to ${APP_NAME}. Text me "how am I doing?" any time. Text STOP to unlink.`;

export type ApproveResult = {
  /** False when the request had expired or the phone was linked elsewhere. */
  linked: boolean;
  /** Whether the phone was sent its confirmation. The link holds either way. */
  texted: boolean;
};

export async function approveLinkAction(
  workspaceId: string,
): Promise<ApproveResult> {
  const own = await requireOwnPersonalWorkspace(workspaceId);
  const phone = await approveLink(own.userId, own.workspaceId);
  // Awaited: a serverless function stops once the action returns.
  const texted =
    phone !== null &&
    (await sendToPhone(phone.platform, phone.spaceId, LINKED_TEXT));
  refresh();
  return { linked: phone !== null, texted };
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
