"use server";

import { refresh } from "next/cache";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import type { NessieStatus, SyncState } from "../domain/sync-state";
import { lastNessieSync } from "./repository";
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

// What the header's Sync control shows: whether the workspace has Nessie
// accounts, when they were last synced, and whether this member may sync.
// The header asks on every page, including one the visitor may not open, so
// a refusal reads as "not linked" instead of a not-found page.
const NOT_LINKED: NessieStatus = {
  linked: false,
  lastSyncedAt: null,
  canSync: false,
};

export async function nessieStatusAction(
  workspaceId: unknown,
): Promise<NessieStatus> {
  let access: Awaited<ReturnType<typeof requireWorkspaceAccess>>;
  try {
    access = await requireWorkspaceAccess(
      await getSession(),
      workspaceId,
      "viewer",
    );
  } catch {
    return NOT_LINKED;
  }
  const { linked, lastSyncedAt } = await lastNessieSync(access.workspaceId);
  return {
    linked,
    lastSyncedAt,
    canSync: roleAtLeast(access.role, "editor"),
  };
}
