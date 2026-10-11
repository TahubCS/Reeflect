import { env } from "@/lib/env";
import { ownPersonalWorkspace } from "../server/access";
import { getLinkState } from "../server/link";
import { PhoneLinkCard } from "./phone-link-card";

/**
 * The Messages card on the Settings page. A phone links to its owner's
 * Personal workspace (ADR-034), so the card shows nowhere else. Reads the
 * session: render it inside a Suspense boundary.
 */
export async function MessagesSection({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const own = await ownPersonalWorkspace(workspaceId);
  if (!own) return null;

  return (
    <PhoneLinkCard
      workspaceId={own.workspaceId}
      state={await getLinkState(own.userId)}
      agentPhone={env.AGENT_PHONE_NUMBER ?? null}
    />
  );
}
