import "server-only";
import type { TurnRequest } from "@reeflect/agent-protocol";
import { alertReplyTurn } from "@/features/alerts";
import {
  type ClaimResult,
  claimLinkCode,
  findIdentity,
  revokeByHandle,
} from "@/features/messaging";
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

export async function runAgentTurn(turn: TurnRequest): Promise<string> {
  const command = parseCommand(turn.text);

  if (command.type === "link") {
    const result = await claimLinkCode({
      platform: turn.platform,
      handle: turn.handle,
      spaceId: turn.spaceId,
      code: command.code,
    });
    return CLAIM_REPLIES[result];
  }

  if (command.type === "stop") {
    const revoked = await revokeByHandle(turn.platform, turn.handle);
    return revoked ? REPLIES.stopped : REPLIES.notLinked;
  }

  // The workspace comes from the verified link and nowhere else (ADR-034).
  const identity = await findIdentity(turn.platform, turn.handle);
  if (!identity) return REPLIES.signUp;

  // Quiet hours come first: their times would otherwise be read as
  // amounts, or as an account number (F-33, ADR-038).
  const quiet = parseQuietHoursCommand(turn.text);
  if (quiet.type !== "none") return quietHoursTurn(quiet, identity.userId);

  // Then a reply to the last alert: KEEP, CANCEL, IGNORE or DETAILS
  // (F-22, F-26, ADR-105).
  const alertReply = await alertReplyTurn(turn.text, identity);
  if (alertReply !== null) return alertReply;

  const context = {
    workspaceId: identity.workspaceId,
    identityId: identity.identityId,
    messageId: turn.messageId,
  };

  // Then an open "which account?" (ADR-065): "2", "checking".
  const answered = await answerPending(turn.text, context);
  if (answered !== null) return answered;

  // Logging and UNDO are read and carried out by code (F-27, ADR-064).
  // UNDO takes back a quiet-hours change instead when that came last
  // (ADR-104). Anything that is not clearly about logging goes on to the
  // answer.
  const log = parseLog(turn.text);
  if (log.type !== "none") {
    // New spending or UNDO: an earlier question is no longer being answered.
    await clearPending(context);
    if (log.type === "undo") {
      const undone = await undoQuietHoursIfLatest(identity);
      if (undone !== null) return undone;
    }
    return logSpending(log, context);
  }
  return answer(turn.text, identity.workspaceId);
}
