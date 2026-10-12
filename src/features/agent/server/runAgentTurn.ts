import "server-only";
import type { TurnRequest } from "@reeflect/agent-protocol";
import {
  type ClaimResult,
  cancelClaimByHandle,
  claimLinkCode,
  findIdentity,
  revokeByHandle,
} from "@/features/messaging";
import { createRateLimit } from "@/lib/security/rate-limit";
import { CHAT_REPLIES, nonTextReply, smallTalkOf } from "../domain/chat";
import { parseLog } from "../domain/log";
import { parseCommand } from "../domain/parse";
import { parseQuietHoursCommand } from "../domain/quiet-hours-command";
import { REPLIES } from "../domain/replies";
import { answer } from "./answer";
import { clearPending } from "./pending";
import { answerPending, logSpending } from "./tools/logSpending";
import { quietHoursTurn, undoQuietHoursIfLatest } from "./tools/quietHours";

// The brain's entry point for one inbound message (ARCH-13). Linking and
// unlinking are executed by code (ADR-040). A phone that is not linked gets
// the sign-up reply and nothing else (ADR-034).

const CLAIM_REPLIES: Record<ClaimResult, string> = {
  pending: REPLIES.linkPending,
  failed: REPLIES.linkFailed,
  locked: REPLIES.linkLocked,
  already_linked: REPLIES.alreadyLinked,
};

/** Texts one phone may send in a minute before it is asked to slow down. */
export const TURNS_PER_MINUTE = 20;

const perPhone = createRateLimit({ limit: TURNS_PER_MINUTE, windowMs: 60_000 });

export async function runAgentTurn(turn: TurnRequest): Promise<string> {
  // A loop or a flood costs the database, the model and the platform's
  // daily quota; one fixed reply costs nothing (ADR-066).
  if (!perPhone.allow(`${turn.platform}:${turn.handle}`)) {
    return CHAT_REPLIES.slowDown;
  }
  // The worker answers direct chats only (ADR-034); this is the backstop,
  // so a group never gets financial data even if the worker misjudges one.
  if (turn.spaceType === "group") return CHAT_REPLIES.group;

  const command = parseCommand(turn.text);

  if (command.type === "stop") {
    // A phone that texted a code but is not approved yet is stopped too, so
    // Approve on the website cannot text it afterwards.
    const [revoked, cancelled] = await Promise.all([
      revokeByHandle(turn.platform, turn.handle),
      cancelClaimByHandle(turn.platform, turn.handle),
    ]);
    if (revoked) return REPLIES.stopped;
    return cancelled ? REPLIES.requestCancelled : REPLIES.notLinked;
  }

  // The workspace comes from the verified link and nowhere else (ADR-034).
  const identity = await findIdentity(turn.platform, turn.handle);

  // Six digits on their own are a code only from a phone that is not
  // linked: from a linked one they are something else ("10 20 30").
  if (command.type === "link" && !(command.bare && identity)) {
    if (command.code === "" && !identity) return REPLIES.linkHow;
    const result = await claimLinkCode({
      platform: turn.platform,
      handle: turn.handle,
      spaceId: turn.spaceId,
      code: command.code,
    });
    return CLAIM_REPLIES[result];
  }

  if (!identity) return REPLIES.signUp;

  // Photos, voice notes and edits get a fixed reply, never silence.
  const nonText = nonTextReply(turn.kind);
  if (nonText !== null) return nonText;

  // Quiet hours come first: their times would otherwise be read as
  // amounts, or as an account number (F-33, ADR-038).
  const quiet = parseQuietHoursCommand(turn.text);
  if (quiet.type !== "none") return quietHoursTurn(quiet, identity.userId);

  const context = {
    workspaceId: identity.workspaceId,
    identityId: identity.identityId,
    messageId: turn.messageId,
  };

  // Then an open "which account?" (ADR-065): "2", "checking".
  const answered = await answerPending(turn.text, context);
  if (answered !== null) return answered;

  // Help, hello and thanks are answered by code, with or without a model.
  const talk = smallTalkOf(turn.text);
  if (talk !== null) return CHAT_REPLIES[talk];

  // Logging and UNDO are read and carried out by code (F-27, ADR-064).
  // UNDO takes back a quiet-hours change instead when that came last
  // (ADR-104). Anything that is not clearly about logging goes on to the
  // answer.
  const log = parseLog(turn.text);
  if (log.type !== "none") {
    // New spending or UNDO: an earlier question is no longer being
    // answered (ADR-065). A text that only looks like spending ("4521",
    // "what was it for?") leaves the question open.
    if (log.type === "log" || log.type === "undo") await clearPending(context);
    if (log.type === "undo") {
      const undone = await undoQuietHoursIfLatest(identity);
      if (undone !== null) return undone;
    }
    return logSpending(log, context);
  }
  return answer(turn.text, identity.workspaceId);
}
