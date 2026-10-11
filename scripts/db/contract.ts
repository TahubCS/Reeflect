// A bounded release contract for the financial pages, not a schema diff.
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import {
  billCycle,
  billDetails,
  billPayment,
  budget,
  category,
  categoryRule,
  financialAccount,
  importBatch,
  organization,
  recurringSeries,
  transaction,
  user,
} from "../../src/lib/db/schema";

export type Reference = {
  columns: string[];
  table: string;
  foreignColumns: string[];
  onDelete: string;
};
export type TableContract = {
  feature: string;
  name: string;
  columns: { name: string; type: string; notNull: boolean }[];
  unique: string[][];
  references: Reference[];
};

function required(
  feature: string,
  table: PgTable,
  only?: string[],
): TableContract {
  const config = getTableConfig(table);
  const columns = config.columns.filter((c) => !only || only.includes(c.name));
  return {
    feature,
    name: config.name,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.getSQLType(),
      notNull: c.notNull,
    })),
    unique: [
      ...columns.filter((c) => c.primary).map((c) => [c.name]),
      ...config.indexes
        .filter((i) => i.config.unique)
        .map((i) =>
          i.config.columns.map((c) => {
            if (!("name" in c) || typeof c.name !== "string")
              throw new Error("Contract requires simple index columns");
            return c.name;
          }),
        ),
    ],
    references: config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      return {
        columns: ref.columns.map((c) => c.name),
        table: getTableConfig(ref.foreignTable).name,
        foreignColumns: ref.foreignColumns.map((c) => c.name),
        onDelete: fk.onDelete ?? "no action",
      };
    }),
  };
}

// These repositories select complete financial rows. Auth is limited to the
// owned references, rather than claiming to validate all of Better Auth.
export const FINANCIAL_CONTRACT: TableContract[] = [
  required("Owned workspace references", organization, ["id"]),
  required("Import author references", user, ["id"]),
  required("Accounts", financialAccount),
  required("Transactions", transaction),
  required("Statement imports", importBatch),
  required("Categorization", category),
  required("Categorization", categoryRule),
  required("Recurring payments", recurringSeries),
  required("Budgets", budget),
  required("Bills", billDetails),
  required("Bills", billCycle),
  required("Bills", billPayment),
];
