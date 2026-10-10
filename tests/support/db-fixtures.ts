// Rows for Vitest integration tests against the Docker database (TEST-05):
// users, workspaces with members, and clean-up. Ids are random, so tests can
// run side by side; `cleanUp` removes everything this helper made.
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { member, organization, user } from "@/lib/db/schema";
import type { WorkspaceRole } from "@/lib/auth/permissions";

export type Fixtures = {
  newUser: () => Promise<string>;
  newWorkspace: (
    members?: Partial<Record<string, WorkspaceRole>>,
  ) => Promise<string>;
  cleanUp: () => Promise<void>;
};

export function fixtures(): Fixtures {
  const userIds: string[] = [];
  const workspaceIds: string[] = [];

  return {
    async newUser() {
      const id = crypto.randomUUID();
      await db
        .insert(user)
        .values({ id, name: "Test", email: `${id}@example.test` });
      userIds.push(id);
      return id;
    },

    /** A workspace whose members are `{ userId: role }`. */
    async newWorkspace(members = {}) {
      const id = uuidv7();
      const now = new Date();
      await db
        .insert(organization)
        .values({ id, name: "Test", slug: `test-${id}`, createdAt: now });
      const rows = Object.entries(members).map(([userId, role]) => ({
        id: uuidv7(),
        organizationId: id,
        userId,
        role: role!,
        createdAt: now,
      }));
      if (rows.length > 0) await db.insert(member).values(rows);
      workspaceIds.push(id);
      return id;
    },

    async cleanUp() {
      // Workspaces cascade to members, accounts and transactions.
      if (workspaceIds.length > 0) {
        await db
          .delete(organization)
          .where(inArray(organization.id, workspaceIds));
      }
      if (userIds.length > 0) {
        await db.delete(user).where(inArray(user.id, userIds));
      }
    },
  };
}

/** Whether `error` is what `notFound()` throws. */
export function isNotFound(error: unknown): boolean {
  return digestOf(error).includes(";404");
}

/** Whether `error` is what `redirect()` throws. */
export function isRedirect(error: unknown): boolean {
  return digestOf(error).startsWith("NEXT_REDIRECT");
}

function digestOf(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string"
    ? error.digest
    : "";
}
