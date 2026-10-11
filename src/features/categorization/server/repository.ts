import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  category,
  categoryRule,
  financialAccount,
  organization,
  transaction,
} from "@/lib/db/schema";
import { cents } from "@/lib/money";
import { type CategoryRule, classifyStored } from "../domain/categorize";
import { normalizeMerchant } from "../domain/normalize-merchant";
import {
  MAX_RULES,
  PAGE_SIZE,
  PRESET_CATEGORIES,
  type CategorySummary,
  type OverrideInput,
  type RuleInput,
  type RuleSummary,
  type TransactionSummary,
} from "../domain/forms";

// Callers authorize first (ARCH-04). Every query, including joins and bulk
// updates, is constrained to that verified workspace. No shared caches.
type Executor = Pick<
  typeof db,
  "select" | "insert" | "update" | "delete" | "execute"
>;
export type WriteResult = "ok" | "not_found" | "rule_limit" | "duplicate_name";

const categoryScope = (workspaceId: string, id: string) =>
  and(eq(category.workspaceId, workspaceId), eq(category.id, id));
const ruleScope = (workspaceId: string, id: string) =>
  and(eq(categoryRule.workspaceId, workspaceId), eq(categoryRule.id, id));
const transactionScope = (workspaceId: string, id: string) =>
  and(eq(transaction.workspaceId, workspaceId), eq(transaction.id, id));

/** Only called after editor authorization; viewers never initialize data. */
export async function ensureCategories(workspaceId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // A workspace can be deleted after the page's authorization check.
    // Hold the referenced row until seeding commits; no orphaned inserts.
    const [workspace] = await tx
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, workspaceId))
      .for("key share");
    if (!workspace) return;
    await tx
      .insert(category)
      .values(
        PRESET_CATEGORIES.map((preset, sortOrder) => ({
          workspaceId,
          name: preset.name,
          colorToken: preset.colorToken,
          sortOrder,
          presetKey: preset.key,
        })),
      )
      .onConflictDoNothing({
        target: [category.workspaceId, category.presetKey],
      });
  });
}

export async function listCategories(
  workspaceId: string,
  executor: Executor = db,
): Promise<CategorySummary[]> {
  return executor
    .select({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      presetKey: category.presetKey,
    })
    .from(category)
    .where(eq(category.workspaceId, workspaceId))
    .orderBy(asc(category.sortOrder), asc(category.id));
}

export async function listRules(
  workspaceId: string,
  executor: Executor = db,
): Promise<RuleSummary[]> {
  return executor
    .select({
      id: categoryRule.id,
      categoryId: categoryRule.categoryId,
      categoryName: category.name,
      pattern: categoryRule.pattern,
      matchType: categoryRule.matchType,
      priority: categoryRule.priority,
    })
    .from(categoryRule)
    .innerJoin(
      category,
      and(
        eq(category.id, categoryRule.categoryId),
        eq(category.workspaceId, workspaceId),
      ),
    )
    .where(eq(categoryRule.workspaceId, workspaceId))
    .orderBy(desc(categoryRule.priority), asc(categoryRule.id));
}

const engineRules = (rules: RuleSummary[]): CategoryRule[] =>
  rules.map(({ id, categoryId, pattern, matchType, priority }) => ({
    id,
    categoryId,
    pattern,
    matchType,
    priority,
  }));

export type CategorizationPageData = {
  categories: CategorySummary[];
  rules: RuleSummary[];
  transactions: TransactionSummary[];
  hasNextPage: boolean;
};

/**
 * Effective categories are recomputed from the current rules on each read.
 * Thus a new imported transaction is categorized even before its importer
 * materializes category_id, and rule edits cannot leave a stale display.
 */
export async function getCategorizationPage(
  workspaceId: string,
  page = 1,
  transactionIds?: readonly string[],
): Promise<CategorizationPageData> {
  return db.transaction(
    async (tx) => {
      const categories = await listCategories(workspaceId, tx);
      const rules = await listRules(workspaceId, tx);
      const rows = await tx
        .select({
          id: transaction.id,
          postedOn: transaction.postedOn,
          descriptionRaw: transaction.descriptionRaw,
          amountCents: transaction.amountCents,
          source: transaction.source,
          isTransfer: transaction.isTransfer,
          categoryId: transaction.categoryId,
          categoryIsManual: transaction.categoryIsManual,
          accountName: financialAccount.nickname,
        })
        .from(transaction)
        .innerJoin(
          financialAccount,
          and(
            eq(financialAccount.id, transaction.financialAccountId),
            eq(financialAccount.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(transaction.workspaceId, workspaceId),
            transactionIds
              ? inArray(transaction.id, [...transactionIds])
              : undefined,
          ),
        )
        .orderBy(
          desc(transaction.postedOn),
          desc(transaction.createdAt),
          desc(transaction.id),
        )
        .limit(PAGE_SIZE + 1)
        .offset(transactionIds ? 0 : (page - 1) * PAGE_SIZE);
      const names = new Map(categories.map((item) => [item.id, item.name]));
      const activeRules = engineRules(rules);
      return {
        categories,
        rules,
        hasNextPage: rows.length > PAGE_SIZE,
        transactions: rows.slice(0, PAGE_SIZE).map((row) => {
          const result = classifyStored(row, activeRules);
          return {
            id: row.id,
            postedOn: row.postedOn,
            descriptionRaw: row.descriptionRaw,
            accountName: row.accountName,
            amountCents: cents(row.amountCents),
            source: row.source,
            isTransfer: row.isTransfer,
            categoryId: result.categoryId,
            categoryName: names.get(result.categoryId ?? "") ?? "Uncategorized",
            merchantNormalized: result.merchantNormalized,
            origin: result.origin,
          };
        }),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/** Category fields for an authorized transaction writer, inside its own SQL transaction. */
export async function getCategoryMetadata(
  workspaceId: string,
  descriptionRaw: string,
  override: { categoryId: string | null; categoryIsManual: boolean } = {
    categoryId: null,
    categoryIsManual: false,
  },
  executor: Executor = db,
): Promise<{ categoryId: string | null; merchantNormalized: string }> {
  const result = classifyStored(
    { descriptionRaw, ...override },
    engineRules(await listRules(workspaceId, executor)),
  );
  return {
    categoryId: result.categoryId,
    merchantNormalized: result.merchantNormalized,
  };
}

// Serialize rule/override writes for a workspace. Account/import writers do
// not need this lock: the read projection above handles newly arriving rows.
async function lockWorkspace(
  executor: Executor,
  workspaceId: string,
): Promise<void> {
  await executor
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .for("update");
}

async function categoryExists(
  executor: Executor,
  workspaceId: string,
  id: string,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: category.id })
    .from(category)
    .where(categoryScope(workspaceId, id));
  return row !== undefined;
}

async function insertRule(
  executor: Executor,
  workspaceId: string,
  input: RuleInput,
): Promise<boolean> {
  const rules = await listRules(workspaceId, executor);
  // Repeated submits of the same choice do not consume additional rule slots.
  if (
    rules.some(
      (rule) =>
        normalizeMerchant(rule.pattern) === normalizeMerchant(input.pattern) &&
        rule.matchType === input.matchType &&
        rule.categoryId === input.categoryId &&
        rule.priority === input.priority,
    )
  )
    return true;
  if (rules.length >= MAX_RULES) return false;
  await executor
    .insert(categoryRule)
    .values({ ...input, workspaceId, origin: "user" });
  return true;
}

async function materialize(
  executor: Executor,
  workspaceId: string,
  ids?: readonly string[],
): Promise<void> {
  if (ids?.length === 0) return;
  const rules = engineRules(await listRules(workspaceId, executor));
  const rows = await executor
    .select({
      id: transaction.id,
      descriptionRaw: transaction.descriptionRaw,
      categoryId: transaction.categoryId,
      categoryIsManual: transaction.categoryIsManual,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.workspaceId, workspaceId),
        eq(transaction.categoryIsManual, false),
        ids ? inArray(transaction.id, [...ids]) : undefined,
      ),
    )
    .for("update");
  // One parameter per batch, rather than one database round trip per row.
  for (let start = 0; start < rows.length; start += 500) {
    const updates = rows.slice(start, start + 500).map((row) => {
      const result = classifyStored(row, rules);
      return {
        id: row.id,
        category_id: result.categoryId,
        merchant_normalized: result.merchantNormalized,
      };
    });
    await executor.execute(sql`
      UPDATE "transaction" AS t
      SET category_id = changes.category_id, merchant_normalized = changes.merchant_normalized, updated_at = now()
      FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb)
        AS changes(id text, category_id text, merchant_normalized text)
      WHERE t.workspace_id = ${workspaceId} AND t.id = changes.id AND t.category_is_manual = false
        AND (t.category_id IS DISTINCT FROM changes.category_id OR t.merchant_normalized IS DISTINCT FROM changes.merchant_normalized)
    `);
  }
}

/** Public post-import hook. Caller must authorize workspace and commit import first. */
export async function applyCategoryRules(
  workspaceId: string,
  transactionIds?: readonly string[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    await materialize(tx, workspaceId, transactionIds);
  });
}

/** The manual choice and optional new rule are committed atomically. */
export async function saveOverride(
  workspaceId: string,
  transactionId: string,
  input: OverrideInput,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const [existing] = await tx
      .select({
        id: transaction.id,
        descriptionRaw: transaction.descriptionRaw,
      })
      .from(transaction)
      .where(transactionScope(workspaceId, transactionId))
      .for("update");
    if (
      !existing ||
      (input.categoryId !== null &&
        !(await categoryExists(tx, workspaceId, input.categoryId)))
    )
      return "not_found";
    if (input.rule && !(await insertRule(tx, workspaceId, input.rule)))
      return "rule_limit";
    await tx
      .update(transaction)
      .set({
        categoryId: input.categoryId,
        categoryIsManual: input.mode === "manual",
        merchantNormalized: normalizeMerchant(existing.descriptionRaw),
      })
      .where(transactionScope(workspaceId, transactionId));
    await materialize(
      tx,
      workspaceId,
      input.rule ? undefined : [transactionId],
    );
    return "ok";
  });
}

export async function createRule(
  workspaceId: string,
  input: RuleInput,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    if (!(await categoryExists(tx, workspaceId, input.categoryId)))
      return "not_found";
    if (!(await insertRule(tx, workspaceId, input))) return "rule_limit";
    await materialize(tx, workspaceId);
    return "ok";
  });
}

export async function updateRule(
  workspaceId: string,
  ruleId: string,
  input: RuleInput,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    if (!(await categoryExists(tx, workspaceId, input.categoryId)))
      return "not_found";
    const updated = await tx
      .update(categoryRule)
      .set(input)
      .where(ruleScope(workspaceId, ruleId))
      .returning({ id: categoryRule.id });
    if (updated.length === 0) return "not_found";
    await materialize(tx, workspaceId);
    return "ok";
  });
}

export async function deleteRule(
  workspaceId: string,
  ruleId: string,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const deleted = await tx
      .delete(categoryRule)
      .where(ruleScope(workspaceId, ruleId))
      .returning({ id: categoryRule.id });
    if (deleted.length === 0) return "not_found";
    await materialize(tx, workspaceId);
    return "ok";
  });
}

export async function renameCategory(
  workspaceId: string,
  categoryId: string,
  name: string,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    if (!(await categoryExists(tx, workspaceId, categoryId)))
      return "not_found";
    const categories = await listCategories(workspaceId, tx);
    if (
      categories.some(
        (item) =>
          item.id !== categoryId &&
          item.name.toLowerCase() === name.toLowerCase(),
      )
    )
      return "duplicate_name";
    await tx
      .update(category)
      .set({ name })
      .where(categoryScope(workspaceId, categoryId));
    return "ok";
  });
}
