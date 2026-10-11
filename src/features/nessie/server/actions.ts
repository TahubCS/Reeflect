"use server";

import { refresh } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import type { SyncState } from "../domain/sync-state";
import { syncNessieWorkspace } from "./sync";

// Sync now (ADR-033), in ARCH-04 order: session, then workspace access at
// editor, then the sync with the verified workspace id.
// The previous state useActionState passes is not needed.
export async function syncNessieAction(
  workspaceId: unknown,
): Promise<SyncState> {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "editor",
  );
  const result = await syncNessieWorkspace(access.workspaceId);
  if (result.status === "synced") refresh();
  return { result, at: new Date().toISOString() };
}
