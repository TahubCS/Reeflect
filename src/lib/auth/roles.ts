import type { WorkspaceRole } from "./permissions";

// Workspace roles in order of what they allow (ARCH-04): each role can do
// everything the ones below it can.
const RANK: Record<WorkspaceRole, number> = { viewer: 0, editor: 1, owner: 2 };

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return Object.hasOwn(RANK, value);
}

/**
 * The strongest workspace role in a member's role field, or null when it has
 * none. Better Auth stores several roles as a comma-separated list, and
 * unknown roles (such as its default "member") grant nothing.
 */
export function strongestRole(stored: string): WorkspaceRole | null {
  let best: WorkspaceRole | null = null;
  for (const part of stored.split(",")) {
    const role = part.trim();
    if (isWorkspaceRole(role) && (best === null || RANK[role] > RANK[best])) {
      best = role;
    }
  }
  return best;
}

/** Whether `role` allows everything `minimum` allows. */
export function roleAtLeast(
  role: WorkspaceRole,
  minimum: WorkspaceRole,
): boolean {
  return RANK[role] >= RANK[minimum];
}
