import { env } from "@/lib/env";
import { ownPersonalWorkspace } from "../server/access";
import { getLinkState } from "../server/link";
import { getAlertTypes, getQuietHours } from "../server/notifications";
import { NotificationsCard } from "./notifications-card";
import { PhoneLinkCard } from "./phone-link-card";

/**
 * The Messages and Notifications cards on the Settings page. A phone links to its owner's
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

  const [state, hours, alertTypes] = await Promise.all([
    getLinkState(own.userId),
    getQuietHours(own.userId),
    getAlertTypes(own.userId),
  ]);
  return (
    <>
      <PhoneLinkCard
        workspaceId={own.workspaceId}
        state={state}
        agentPhone={env.AGENT_PHONE_NUMBER ?? null}
      />
      <NotificationsCard
        workspaceId={own.workspaceId}
        hours={hours}
        alertTypes={alertTypes}
      />
    </>
  );
}
