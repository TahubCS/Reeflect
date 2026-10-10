import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { ensurePersonalWorkspace } from "@/lib/auth/personal-workspace";
import { getSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
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
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "owner");
  const userId = session!.user.id;
  if ((await ensurePersonalWorkspace(userId)) !== access.workspaceId) {
    return null;
  }

  return (
    <PhoneLinkCard
      workspaceId={access.workspaceId}
      state={await getLinkState(userId)}
      agentPhone={env.AGENT_PHONE_NUMBER ?? null}
    />
  );
}
