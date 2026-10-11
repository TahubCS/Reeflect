import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { financialAccount, transaction } from "@/lib/db/schema";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  createRuleAction,
  deleteRuleAction,
  renameCategoryAction,
  saveOverrideAction,
  updateRuleAction,
} from "./actions";
import * as repository from "./repository";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));
const f = fixtures();
const EMPTY = { errors: {} };
let editor: string;
let viewer: string;
let workspace: string;
let other: string;
let categoryId: string;
let otherCategoryId: string;
let transactionId: string;
let otherTransactionId: string;
let ruleId: string;

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const ruleForm = (values: Record<string, string> = {}) =>
  form({
    categoryId,
    pattern: "Action merchant",
    matchType: "contains",
    priority: "100",
    ...values,
  });
async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected control-flow exception");
}
const editorSession = () =>
  getSession.mockResolvedValue({ user: { id: editor } });

beforeAll(async () => {
  editor = await f.newUser();
  viewer = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor", [viewer]: "viewer" });
  other = await f.newWorkspace();
  for (const workspaceId of [workspace, other]) {
    await repository.ensureCategories(workspaceId);
    const [account] = await db
      .insert(financialAccount)
      .values({
        workspaceId,
        institutionName: "Synthetic bank",
        type: "checking",
        nickname: "Everyday",
        source: "synthetic",
      })
      .returning();
    const [row] = await db
      .insert(transaction)
      .values({
        workspaceId,
        financialAccountId: account!.id,
        postedOn: "2026-10-10",
        amountCents: -2000,
        descriptionRaw: "Action merchant",
        source: "synthetic",
        fingerprint: uuidv7(),
      })
      .returning();
    if (workspaceId === workspace) transactionId = row!.id;
    else otherTransactionId = row!.id;
  }
  categoryId = (await repository.listCategories(workspace))[0]!.id;
  otherCategoryId = (await repository.listCategories(other))[0]!.id;
  await repository.createRule(workspace, {
    categoryId,
    pattern: "Existing rule",
    matchType: "exact",
    priority: 1,
  });
  ruleId = (await repository.listRules(workspace))[0]!.id;
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => f.cleanUp());

describe("editor actions", () => {
  it("creates and edits a rule, then returns to the workspace's Transactions page", async () => {
    editorSession();
    const created = await thrown(
      createRuleAction(workspace, EMPTY, ruleForm()),
    );
    expect(isRedirect(created)).toBe(true);
    expect(created).toMatchObject({
      digest: expect.stringContaining(`/w/${workspace}/transactions`),
    });
    const rule = (await repository.listRules(workspace)).find(
      (r) => r.pattern === "Action merchant",
    )!;
    expect(
      isRedirect(
        await thrown(
          updateRuleAction(
            workspace,
            rule.id,
            EMPTY,
            ruleForm({ matchType: "exact", priority: "200" }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      (await repository.listRules(workspace)).find((r) => r.id === rule.id),
    ).toMatchObject({ matchType: "exact", priority: 200 });
  });
  it("validates and saves a manual override and optional exact merchant rule", async () => {
    editorSession();
    expect(
      isRedirect(
        await thrown(
          saveOverrideAction(
            workspace,
            transactionId,
            EMPTY,
            ruleForm({ mode: "manual", saveRule: "on", matchType: "exact" }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      (await repository.getCategorizationPage(workspace)).transactions[0],
    ).toMatchObject({ categoryId, origin: "manual" });
    expect(
      (await repository.listRules(workspace)).some(
        (r) => r.pattern === "Action merchant" && r.matchType === "exact",
      ),
    ).toBe(true);
  });
  it("allows manual Uncategorized, then clears it back to rules", async () => {
    editorSession();
    expect(
      isRedirect(
        await thrown(
          saveOverrideAction(
            workspace,
            transactionId,
            EMPTY,
            form({ mode: "manual", categoryId: "" }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      (await repository.getCategorizationPage(workspace)).transactions[0],
    ).toMatchObject({ categoryName: "Uncategorized", origin: "manual" });
    expect(
      isRedirect(
        await thrown(
          saveOverrideAction(
            workspace,
            transactionId,
            EMPTY,
            form({ mode: "automatic", categoryId: "automatic" }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      (await repository.getCategorizationPage(workspace)).transactions[0]
        ?.origin,
    ).toBe("rule");
  });
  it("returns field errors without writing on invalid rule input", async () => {
    editorSession();
    const before = await repository.listRules(workspace);
    const data = ruleForm({ pattern: " ", priority: "1.5" });
    data.set("__proto__", "ignored");
    const state = await createRuleAction(workspace, EMPTY, data);
    expect(state.errors.pattern).toBeDefined();
    expect(state.errors.priority).toBeDefined();
    expect(state.values).toMatchObject({ pattern: " ", priority: "1.5" });
    expect(Object.keys(state.values ?? {})).not.toContain("__proto__");
    expect(await repository.listRules(workspace)).toEqual(before);
    const edited = await updateRuleAction(
      workspace,
      ruleId,
      EMPTY,
      ruleForm({ pattern: "REF ABC123" }),
    );
    expect(edited.errors.pattern).toBeDefined();
    expect(await repository.listRules(workspace)).toEqual(before);
  });
  it("writes neither a choice nor a rule if the optional rule is invalid", async () => {
    editorSession();
    const before = await repository.getCategorizationPage(workspace);
    const state = await saveOverrideAction(
      workspace,
      transactionId,
      EMPTY,
      ruleForm({ mode: "manual", saveRule: "on", pattern: "" }),
    );
    expect(state.errors.pattern).toBeDefined();
    expect(await repository.getCategorizationPage(workspace)).toEqual(before);
  });
  it("renames a category and validates blank, duplicate and file names", async () => {
    editorSession();
    expect(
      isRedirect(
        await thrown(
          renameCategoryAction(
            workspace,
            categoryId,
            EMPTY,
            form({ name: "  Food  " }),
          ),
        ),
      ),
    ).toBe(true);
    expect((await repository.listCategories(workspace))[0]?.name).toBe("Food");
    expect(
      (
        await renameCategoryAction(
          workspace,
          categoryId,
          EMPTY,
          form({ name: "" }),
        )
      ).errors.name,
    ).toBe("Enter a category name.");
    expect(
      (await renameCategoryAction(workspace, categoryId, EMPTY, new FormData()))
        .values?.name,
    ).toBe("");
    const file = new FormData();
    file.set("name", new Blob(["name"]));
    expect(
      (await renameCategoryAction(workspace, categoryId, EMPTY, file)).errors
        .name,
    ).toBeDefined();
    const another = (await repository.listCategories(workspace))[1]!;
    expect(
      (
        await renameCategoryAction(
          workspace,
          another.id,
          EMPTY,
          form({ name: "food" }),
        )
      ).errors.name,
    ).toBe("A category already has this name.");
  });
  it("deletes a rule and refuses deleting the same id twice", async () => {
    editorSession();
    expect(
      isRedirect(
        await thrown(
          deleteRuleAction(workspace, ruleId, EMPTY, new FormData()),
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await thrown(
          deleteRuleAction(workspace, ruleId, EMPTY, new FormData()),
        ),
      ),
    ).toBe(true);
  });
  it("handles an unexpected database failure with a safe retry message", async () => {
    editorSession();
    vi.spyOn(repository, "createRule").mockRejectedValueOnce(
      new Error("secret transaction contents"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await createRuleAction(workspace, EMPTY, ruleForm());
    expect(state).toMatchObject({
      errors: { form: "Could not save your changes. Please try again." },
      values: { pattern: "Action merchant" },
    });
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(log).toHaveBeenCalledWith("categorization: write failed", {
      workspaceId: workspace,
    });
  });
  it("returns a rule-limit message without losing the entered values", async () => {
    editorSession();
    vi.spyOn(repository, "createRule").mockResolvedValueOnce("rule_limit");
    const state = await createRuleAction(workspace, EMPTY, ruleForm());
    expect(state.errors.form).toContain("1,000 rules");
    expect(state.values?.pattern).toBe("Action merchant");
  });
});

describe("untrusted object ids", () => {
  it.each([undefined, "not-an-id", crypto.randomUUID()])(
    "refuses an unknown transaction %j",
    async (id) => {
      editorSession();
      expect(
        isNotFound(
          await thrown(
            saveOverrideAction(
              workspace,
              id,
              EMPTY,
              form({ mode: "manual", categoryId }),
            ),
          ),
        ),
      ).toBe(true);
    },
  );
  it("rejects foreign transaction/category/rule ids and form attempts to switch workspace", async () => {
    editorSession();
    const before = await repository.getCategorizationPage(other);
    expect(
      isNotFound(
        await thrown(
          saveOverrideAction(
            workspace,
            otherTransactionId,
            EMPTY,
            form({ mode: "manual", categoryId }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await thrown(
          saveOverrideAction(
            workspace,
            transactionId,
            EMPTY,
            form({ mode: "manual", categoryId: otherCategoryId }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await thrown(
          createRuleAction(
            workspace,
            EMPTY,
            ruleForm({ categoryId: otherCategoryId, workspaceId: other }),
          ),
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await thrown(
          updateRuleAction(workspace, crypto.randomUUID(), EMPTY, ruleForm()),
        ),
      ),
    ).toBe(true);
    expect(
      isNotFound(
        await thrown(
          renameCategoryAction(
            workspace,
            otherCategoryId,
            EMPTY,
            form({ name: "Private" }),
          ),
        ),
      ),
    ).toBe(true);
    expect(await repository.getCategorizationPage(other)).toEqual(before);
  });
  it.each([
    (id: unknown) => updateRuleAction(workspace, id, EMPTY, ruleForm()),
    (id: unknown) => deleteRuleAction(workspace, id, EMPTY, new FormData()),
    (id: unknown) =>
      renameCategoryAction(workspace, id, EMPTY, form({ name: "Name" })),
  ])("rejects malformed bound ids before a write %#", async (call) => {
    editorSession();
    expect(isNotFound(await thrown(call("bad-id")))).toBe(true);
  });
  it("does not accept a forged automatic choice with a manual category", async () => {
    editorSession();
    const before = await db
      .select()
      .from(transaction)
      .where(eq(transaction.id, transactionId));
    const result = await saveOverrideAction(
      workspace,
      transactionId,
      EMPTY,
      form({ mode: "automatic", categoryId }),
    );
    expect(result.errors.categoryId).toBeDefined();
    expect(
      await db
        .select()
        .from(transaction)
        .where(eq(transaction.id, transactionId)),
    ).toEqual(before);
  });
});
