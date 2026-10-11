import type { Reference, TableContract } from "./contract";

export type TableFacts = {
  name: string;
  columns: { name: string; type: string; notNull: boolean }[];
  unique: { columns: string[]; valid: boolean }[];
  references: (Reference & { validated: boolean; schema: string })[];
  readable: boolean;
};
export type SchemaIssue = { feature: string; object: string; problem: string };

const sameColumns = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().every((c, i) => c === [...b].sort()[i]);
function sameReference(a: Reference, b: Reference): boolean {
  const mapping = (r: Reference) =>
    r.columns
      .map((c, i) => `${c}:${r.foreignColumns[i]}`)
      .sort()
      .join(",");
  return (
    a.table === b.table &&
    a.onDelete === b.onDelete &&
    mapping(a) === mapping(b)
  );
}

/** Names of constraints/indexes are immaterial; their valid semantics matter. */
export function compareSchema(
  contract: readonly TableContract[],
  facts: readonly TableFacts[],
  schema = "public",
): SchemaIssue[] {
  const issues: SchemaIssue[] = [];
  for (const expected of contract) {
    const issue = (object: string, problem: string) =>
      issues.push({
        feature: expected.feature,
        object: `${expected.name}${object}`,
        problem,
      });
    const actual = facts.find((t) => t.name === expected.name);
    if (!actual) {
      issue("", "required table is missing");
      continue;
    }
    for (const column of expected.columns) {
      const found = actual.columns.find((c) => c.name === column.name);
      if (!found) issue(`.${column.name}`, "required column is missing");
      else if (found.type !== column.type || found.notNull !== column.notNull)
        issue(
          `.${column.name}`,
          `requires ${column.type}${column.notNull ? " NOT NULL" : " nullable"}`,
        );
    }
    for (const columns of expected.unique)
      if (
        !actual.unique.some((i) => i.valid && sameColumns(columns, i.columns))
      )
        issue(
          ` (${columns.join(", ")})`,
          "valid unconditional uniqueness is missing",
        );
    for (const ref of expected.references)
      if (
        !actual.references.some(
          (f) => f.validated && f.schema === schema && sameReference(ref, f),
        )
      )
        issue(
          ` (${ref.columns.join(", ")})`,
          `validated ownership/reference to ${ref.table} is missing`,
        );
    if (!actual.readable)
      issue("", "required columns cannot be read by this role");
  }
  return issues;
}
