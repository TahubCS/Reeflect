"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { APP_NAME } from "@/config/app";
import { fromTimeInput, isValidQuietHours } from "../domain/quiet-hours";
import { ownPersonalWorkspace } from "./access";
import {
  type LinkedPhone,
  type NewLinkCode,
  approveLink,
  createLinkCode,
  rejectLink,
  revokeForUser,
  setProactiveOptIn,
} from "./link";
import { setQuietHours } from "./notifications";
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
 * What the phone is told when the website changes what it can do. Each
 * confirms what the user just did, so it is not a proactive message
 * (ADR-062); none carries an amount or any financial data.
 */
const LINKED_TEXT = `You're linked to ${APP_NAME}. Text me "how am I doing?" any time. Text STOP to unlink.`;
const DISCONNECTED_TEXT = `This phone was disconnected from ${APP_NAME} on the website, so I won't answer here any more. You can link it again from Settings.`;
const REFUSED_TEXT = `That link request was declined on the ${APP_NAME} website. Nothing was linked.`;

/** Tells a phone, when there is one to tell. True when the text went out. */
async function tell(phone: LinkedPhone | null, text: string): Promise<boolean> {
  // Awaited: a serverless function stops once the action returns.
  return (
    phone !== null && (await sendToPhone(phone.platform, phone.spaceId, text))
  );
}

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
  const texted = await tell(phone, LINKED_TEXT);
  refresh();
  return { linked: phone !== null, texted };
}

/** Whether the phone was sent a text saying so. It holds either way. */
export type Told = { texted: boolean };

export async function rejectLinkAction(workspaceId: string): Promise<Told> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  const texted = await tell(await rejectLink(userId), REFUSED_TEXT);
  refresh();
  return { texted };
}

export async function disconnectAction(workspaceId: string): Promise<Told> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  const texted = await tell(await revokeForUser(userId), DISCONNECTED_TEXT);
  refresh();
  return { texted };
}

export async function setProactiveOptInAction(
  workspaceId: string,
  optIn: boolean,
): Promise<void> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  await setProactiveOptIn(userId, z.boolean().parse(optIn));
  refresh();
}

export type QuietHoursResult =
  { ok: true } | { ok: false; error: "invalid" | "same" };

const timeInput = z.string().max(5);

/** Sets quiet hours from Settings → Notifications (F-33, ADR-038). */
export async function setQuietHoursAction(
  workspaceId: string,
  start: string,
  end: string,
): Promise<QuietHoursResult> {
  const { userId } = await requireOwnPersonalWorkspace(workspaceId);
  const startMinute = fromTimeInput(timeInput.parse(start));
  const endMinute = fromTimeInput(timeInput.parse(end));
  if (startMinute === null || endMinute === null) {
    return { ok: false, error: "invalid" };
  }
  const hours = { startMinute, endMinute };
  if (!isValidQuietHours(hours)) return { ok: false, error: "same" };
  await setQuietHours(userId, hours);
  refresh();
  return { ok: true };
}
