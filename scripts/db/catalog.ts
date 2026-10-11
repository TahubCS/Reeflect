import type pg from "pg";
import type { TableContract, Reference } from "./contract";
import type { TableFacts } from "./schema-check";

export type CatalogClient = Pick<pg.Client, "query">;
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;
const deleteActions: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
};

/** Only catalog SELECTs and zero-row SELECTs; caller starts a read-only snapshot. */
export async function inspectSchema(
  client: CatalogClient,
  contract: readonly TableContract[],
  schema = "public",
): Promise<TableFacts[]> {
  const names = contract.map((t) => t.name);
  const tables = await client.query<{ name: string }>(
    `
    SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND c.relkind IN ('r','p')`,
    [schema, names],
  );
  const columns = await client.query<{
    table: string;
    name: string;
    type: string;
    notNull: boolean;
  }>(
    `
    SELECT c.relname AS table, a.attname AS name,
      format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS "notNull"
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND a.attnum>0 AND NOT a.attisdropped`,
    [schema, names],
  );
  const unique = await client.query<{
    table: string;
    columns: string[];
    valid: boolean;
  }>(
    `
    SELECT c.relname AS table,
      ARRAY(SELECT a.attname::text FROM unnest(i.indkey::smallint[]) WITH ORDINALITY k(num,pos)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num
        WHERE k.pos<=i.indnkeyatts ORDER BY k.pos) AS columns,
      (i.indisvalid AND i.indisready AND i.indislive AND i.indpred IS NULL AND i.indexprs IS NULL) AS valid
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND i.indisunique`,
    [schema, names],
  );
  const references = await client.query<
    Reference & { localTable: string; schema: string; validated: boolean }
  >(
    `
    SELECT c.relname AS "localTable", f.relname AS table, fn.nspname AS schema,
      ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(num,pos)
        JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.pos) AS columns,
      ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(num,pos)
        JOIN pg_attribute a ON a.attrelid=f.oid AND a.attnum=k.num ORDER BY k.pos) AS "foreignColumns",
      con.confdeltype AS "onDelete", con.convalidated AS validated
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class f ON f.oid=con.confrelid
    JOIN pg_namespace fn ON fn.oid=f.relnamespace
    WHERE n.nspname=$1 AND c.relname=ANY($2::text[]) AND con.contype='f'`,
    [schema, names],
  );
  const facts: TableFacts[] = [];
  for (const { name } of tables.rows) {
    const expected = contract.find((t) => t.name === name)!;
    let readable = false;
    await client.query("SAVEPOINT read_probe");
    try {
      await client.query(
        `SELECT ${expected.columns.map((c) => quoted(c.name)).join(",")} FROM ${quoted(schema)}.${quoted(name)} LIMIT 0`,
      );
      readable = true;
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT read_probe");
      const code = (error as { code?: string }).code;
      if (code !== "42501" && code !== "42703" && code !== "42P01") throw error;
    } finally {
      await client.query("RELEASE SAVEPOINT read_probe");
    }
    facts.push({
      name,
      readable,
      columns: columns.rows.filter((c) => c.table === name),
      unique: unique.rows.filter((i) => i.table === name),
      references: references.rows
        .filter((f) => f.localTable === name)
        .map((f) => ({ ...f, onDelete: deleteActions[f.onDelete]! })),
    });
  }
  return facts;
}
