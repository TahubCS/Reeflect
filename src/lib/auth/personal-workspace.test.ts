import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { member, organization, user } from "@/lib/db/schema";
import {
  PERSONAL_WORKSPACE_NAME,
  ensurePersonalWorkspace,
  personalSlug,
} from "./personal-workspace";

// Integration tests: they need the PostgreSQL from `docker compose up -d`
// (or the CI service), migrated. See TEST-05.
const userIds: string[] = [];

async function newUser(): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insert(user)
    .values({ id, name: "Test", email: `${id}@example.test` });
  userIds.push(id);
  return id;
}

afterAll(async () => {
  // Deleting the users removes their memberships; the workspaces go by slug.
  await db
    .delete(organization)
    .where(inArray(organization.slug, userIds.map(personalSlug)));
  await db.delete(user).where(inArray(user.id, userIds));
});

describe("personalSlug", () => {
  it("is derived from the user id", () => {
    expect(personalSlug("abc")).toBe("personal-abc");
  });
});

describe("ensurePersonalWorkspace", () => {
  it("creates a Personal workspace with the user as its only owner", async () => {
    const userId = await newUser();

    const id = await ensurePersonalWorkspace(userId);

    const [workspace] = await db
      .select()
      .from(organization)
      .where(eq(organization.id, id));
    expect(workspace).toMatchObject({
      name: PERSONAL_WORKSPACE_NAME,
      slug: personalSlug(userId),
      metadata: JSON.stringify({ kind: "personal" }),
    });
    const members = await db
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(eq(member.organizationId, id));
    expect(members).toEqual([{ userId, role: "owner" }]);
  });

  it("returns the same workspace when called again", async () => {
    const userId = await newUser();

    const first = await ensurePersonalWorkspace(userId);
    const second = await ensurePersonalWorkspace(userId);

    expect(second).toBe(first);
  });

  it("creates only one workspace when called twice at once", async () => {
    const userId = await newUser();

    const [a, b] = await Promise.all([
      ensurePersonalWorkspace(userId),
      ensurePersonalWorkspace(userId),
    ]);

    expect(a).toBe(b);
    const workspaces = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, personalSlug(userId)));
    expect(workspaces).toHaveLength(1);
  });

  it("fails clearly when the slug belongs to a workspace the user is not in", async () => {
    const userId = await newUser();
    await db.insert(organization).values({
      id: crypto.randomUUID(),
      name: "Squatter",
      slug: personalSlug(userId),
      createdAt: new Date(),
    });

    await expect(ensurePersonalWorkspace(userId)).rejects.toThrow(
      `personal workspace slug taken for user ${userId}`,
    );
  });
});
