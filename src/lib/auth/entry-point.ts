import type { WorkspaceRole } from "./permissions";

/** Ids that belong to the workspace an entry point is pointed at. */
export type EntryPointTarget = {
  workspaceId: string;
  accountId: string;
  /** A transaction on `accountId`. */
  transactionId: string;
};

/**
 * A server action or route handler, listed so the workspace isolation
 * matrix (TEST-06) can call it with another workspace's ids. Each feature
 * exports a list of these from `server/entry-points.ts`, and
 * `src/lib/auth/isolation.test.ts` runs every list. `call` sends valid
 * input, so a refusal can only come from authorization.
 */
export type EntryPoint = {
  name: string;
  minimumRole: WorkspaceRole;
  call: (target: EntryPointTarget) => Promise<unknown>;
};
