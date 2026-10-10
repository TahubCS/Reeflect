import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { member, organization, user } from "@/lib/db/schema";
import { requireWorkspaceAccess } from "./authz";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.

const workspaceId = uuidv7();
const otherWorkspaceId = uuidv7();
const people = {
  owner: crypto.randomUUID(),
  editor: crypto.randomUUID(),
  viewer: crypto.randomUUID(),
  member: crypto.randomUUID(),
  stranger: crypto.randomUUID(),
};
const as = (id: string) => ({ user: { id } });

/** `notFound()` throws an error whose digest marks it as a 404. */
async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    digest: expect.stringContaining("404"),
  });
}

beforeAll(async () => {
  const now = new Date();
  await db.insert(user).values(
    Object.values(people).map((id) => ({
      id,
      name: "Test",
      email: `${id}@example.test`,
    })),
  );
  await db.insert(organization).values(
    [workspaceId, otherWorkspaceId].map((id) => ({
      id,
      name: "Test",
      slug: `authz-test-${id}`,
      createdAt: now,
    })),
  );
  await db.insert(member).values([
    ...(["owner", "editor", "viewer", "member"] as const).map((role) => ({
      id: uuidv7(),
      organizationId: workspaceId,
      userId: people[role],
      role,
      createdAt: now,
    })),
    {
      id: uuidv7(),
      organizationId: otherWorkspaceId,
      userId: people.stranger,
      role: "owner",
      createdAt: now,
    },
  ]);
});

afterAll(async () => {
  await db
    .delete(organization)
    .where(inArray(organization.id, [workspaceId, otherWorkspaceId]));
  await db.delete(user).where(inArray(user.id, Object.values(people)));
});

describe("requireWorkspaceAccess", () => {
  it("lets a member in at or below their role and returns it", async () => {
    await expect(
      requireWorkspaceAccess(as(people.owner), workspaceId, "owner"),
    ).resolves.toEqual({ workspaceId, role: "owner" });
    await expect(
      requireWorkspaceAccess(as(people.editor), workspaceId, "viewer"),
    ).resolves.toEqual({ workspaceId, role: "editor" });
    await expect(
      requireWorkspaceAccess(as(people.viewer), workspaceId, "viewer"),
    ).resolves.toEqual({ workspaceId, role: "viewer" });
  });

  it("hides the workspace from a member whose role is too low", async () => {
    await expectNotFound(
      requireWorkspaceAccess(as(people.viewer), workspaceId, "editor"),
    );
    await expectNotFound(
      requireWorkspaceAccess(as(people.editor), workspaceId, "owner"),
    );
  });

  it("hides the workspace from a member with no workspace role", async () => {
    await expectNotFound(
      requireWorkspaceAccess(as(people.member), workspaceId, "viewer"),
    );
  });

  it("hides another workspace from its non-members", async () => {
    await expectNotFound(
      requireWorkspaceAccess(as(people.stranger), workspaceId, "viewer"),
    );
    await expectNotFound(
      requireWorkspaceAccess(as(people.owner), otherWorkspaceId, "viewer"),
    );
  });

  it("hides everything without a session", async () => {
    await expectNotFound(requireWorkspaceAccess(null, workspaceId, "viewer"));
  });

  it("rejects malformed ids before querying", async () => {
    for (const bad of ["", "a/b", "x".repeat(65), 42, undefined]) {
      await expectNotFound(
        requireWorkspaceAccess(as(people.owner), bad, "viewer"),
      );
    }
  });

  it("finds nothing for an id that does not exist", async () => {
    await expectNotFound(
      requireWorkspaceAccess(as(people.owner), uuidv7(), "viewer"),
    );
  });
});
