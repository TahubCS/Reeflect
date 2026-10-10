import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access";

// Workspace roles (ADR-007, ARCH-04). Shared by the server and the browser
// client, so this file must stay free of server-only imports.
const statement = {
  ...defaultStatements,
  data: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

/** Manages members and can delete the workspace. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  data: ["read", "write"],
});

/** Adds and edits data, runs imports, links banks. */
export const editor = ac.newRole({
  data: ["read", "write"],
  ac: ["read"],
});

/** Read only. */
export const viewer = ac.newRole({
  data: ["read"],
  ac: ["read"],
});

export const roles = { owner, editor, viewer };

export type WorkspaceRole = keyof typeof roles;
