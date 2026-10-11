import "server-only";
import type { TurnRequest } from "@reeflect/agent-protocol";
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
import { logSpending } from "./tools/logSpending";
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

  // Quiet hours come before logging, which would read their times as
  // amounts (F-33, ADR-038).
  const quiet = parseQuietHoursCommand(turn.text);
  if (quiet.type !== "none") return quietHoursTurn(quiet, identity.userId);

  // Logging and UNDO are read and carried out by code (F-27, ADR-064).
  // UNDO takes back a quiet-hours change instead when that came last
  // (ADR-104). Anything that is not clearly about logging goes on to the
  // answer.
  const log = parseLog(turn.text);
  if (log.type === "undo") {
    const undone = await undoQuietHoursIfLatest(identity);
    if (undone !== null) return undone;
  }
  if (log.type !== "none") {
    return logSpending(log, {
      workspaceId: identity.workspaceId,
      identityId: identity.identityId,
      messageId: turn.messageId,
    });
  }
  return answer(turn.text, identity.workspaceId);
}
