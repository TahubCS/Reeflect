import Link from "next/link";
import type {
  CategorySummary,
  FormAction,
  RuleSummary,
  TransactionSummary,
} from "../domain/forms";
import {
  DeleteRuleForm,
  OverrideForm,
  RenameCategoryForm,
  RuleForm,
} from "./forms";
import styles from "./categorization.module.css";

type ObjectAction = (
  id: unknown,
  ...args: Parameters<FormAction>
) => ReturnType<FormAction>;

/** Category controls composed into F-04's transaction list. */
export function TransactionCategory({
  item,
  categories,
  canEdit,
  action,
}: {
  item: TransactionSummary;
  categories: CategorySummary[];
  canEdit: boolean;
  action: ObjectAction;
}) {
  return (
    <>
      <p className={styles.category}>{item.categoryName}</p>
      <p className={styles.note}>
        {item.origin === "manual"
          ? "Manual choice"
          : item.origin === "rule"
            ? "Automatic rule"
            : "No matching rule"}
      </p>
      {canEdit && categories.length > 0 && (
        <details className={styles.details}>
          <summary>Change category</summary>
          <OverrideForm
            key={`${item.origin}:${item.categoryId}`}
            action={action.bind(null, item.id)}
            item={{
              id: item.id,
              descriptionRaw: item.descriptionRaw,
              merchantNormalized: item.merchantNormalized,
              categoryId: item.categoryId,
              origin: item.origin,
            }}
            categories={categories}
          />
        </details>
      )}
    </>
  );
}

export function TransactionPagination({
  workspaceId,
  accountId,
  page,
  hasNextPage,
}: {
  workspaceId: string;
  accountId: string | null;
  page: number;
  hasNextPage: boolean;
}) {
  if (page === 1 && !hasNextPage) return null;
  const href = (number: number) => {
    const params = new URLSearchParams();
    if (accountId) params.set("account", accountId);
    if (number > 1) params.set("page", String(number));
    return `/w/${workspaceId}/transactions${params.size ? `?${params}` : ""}`;
  };
  return (
    <nav aria-label="Transaction pages" className={styles.actions}>
      {page > 1 && <Link href={href(page - 1)}>Previous page</Link>}
      <span>Page {page}</span>
      {hasNextPage && <Link href={href(page + 1)}>Next page</Link>}
    </nav>
  );
}

/** Rule management and editable presets below the existing transaction list. */
export function CategorizationPanels({
  categories,
  rules,
  canEdit,
  createRuleAction,
  updateRuleAction,
  deleteRuleAction,
  renameCategoryAction,
}: {
  categories: CategorySummary[];
  rules: RuleSummary[];
  canEdit: boolean;
  createRuleAction: FormAction;
  updateRuleAction: ObjectAction;
  deleteRuleAction: ObjectAction;
  renameCategoryAction: ObjectAction;
}) {
  const matchLabels = {
    contains: "Contains",
    starts_with: "Starts with",
    exact: "Exact merchant",
  };
  return (
    <>
      <p className={styles.lede}>
        Rules categorize matching merchants, and you can change any category by
        hand.
      </p>
      {!canEdit && (
        <p className={styles.note}>
          You have view-only access. An editor or owner can change categories
          and rules.
        </p>
      )}
      <section aria-labelledby="rules-heading" className={styles.section}>
        <h2 id="rules-heading">Categorization rules</h2>
        <p className={styles.note}>
          Rules match merchant names after store and reference numbers are
          removed. Highest priority wins. Use different priorities to control
          overlapping rules.
        </p>
        {rules.length === 0 ? (
          <p className={styles.empty}>No saved rules yet.</p>
        ) : (
          <ul className={styles.list}>
            {rules.map((rule) => (
              <li key={rule.id} className={styles.rule}>
                <p>
                  <strong>{rule.pattern}</strong> → {rule.categoryName}
                </p>
                <p className={styles.note}>
                  {matchLabels[rule.matchType]} · Priority {rule.priority}
                </p>
                {canEdit && (
                  <details className={styles.details}>
                    <summary>Edit rule for {rule.pattern}</summary>
                    <RuleForm
                      key={`${rule.pattern}:${rule.categoryId}:${rule.priority}:${rule.matchType}`}
                      action={updateRuleAction.bind(null, rule.id)}
                      initial={rule}
                      categories={categories}
                      submitLabel="Save rule"
                    />
                    <DeleteRuleForm
                      action={deleteRuleAction.bind(null, rule.id)}
                    />
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && categories.length > 0 && (
          <details className={styles.details}>
            <summary>Add a rule</summary>
            <RuleForm
              action={createRuleAction}
              initial={{
                categoryId: "",
                pattern: "",
                matchType: "contains",
                priority: 100,
              }}
              categories={categories}
              submitLabel="Add rule"
            />
          </details>
        )}
      </section>
      <section aria-labelledby="categories-heading" className={styles.section}>
        <h2 id="categories-heading">Categories</h2>
        {categories.length === 0 ? (
          <p className={styles.empty}>
            An editor or owner can open this page to set up the workspace’s
            categories.
          </p>
        ) : (
          <ul className={styles.list}>
            {categories.map((category) => (
              <li key={category.id} className={styles.rule}>
                {canEdit ? (
                  <details>
                    <summary>{category.name}</summary>
                    <RenameCategoryForm
                      key={category.name}
                      action={renameCategoryAction.bind(null, category.id)}
                      category={category}
                    />
                  </details>
                ) : (
                  category.name
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
