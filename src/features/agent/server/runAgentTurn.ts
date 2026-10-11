import "server-only";
import type { TurnRequest } from "@reeflect/agent-protocol";
import {
  type ClaimResult,
  claimLinkCode,
  findIdentity,
  revokeByHandle,
} from "@/features/messaging";
import { parseCommand } from "../domain/parse";
import { REPLIES } from "../domain/replies";

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

  const identity = await findIdentity(turn.platform, turn.handle);
  return identity ? REPLIES.linked : REPLIES.signUp;
}
