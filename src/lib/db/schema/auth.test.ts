import { getAuthTables } from "better-auth/db";
import { organization } from "better-auth/plugins";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import * as schema from "./auth";

// Better Auth reads and writes these tables through the Drizzle adapter, so
// the schema must match what this Better Auth version expects. If this fails
// after an upgrade, regenerate the tables and add a migration.
const expected = getAuthTables({
  plugins: [organization()],
  rateLimit: { storage: "database" },
});

const snakeCase = (name: string) =>
  name.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase();

const tables = schema as unknown as Record<string, PgTable>;

describe("auth schema", () => {
  it.each(Object.entries(expected))(
    "matches Better Auth's %s table",
    (model, definition) => {
      const table = tables[definition.modelName];
      expect(table, `missing table for ${model}`).toBeDefined();

      const config = getTableConfig(table);
      expect(config.name).toBe(snakeCase(definition.modelName));

      const columns = new Map(config.columns.map((c) => [c.name, c]));
      expect(columns.get("id")?.primary).toBe(true);
      for (const [field, attributes] of Object.entries(definition.fields)) {
        const column = columns.get(snakeCase(field));
        expect(column, `missing column ${model}.${field}`).toBeDefined();
        expect(column?.notNull, `${model}.${field} nullability`).toBe(
          attributes.required !== false,
        );
      }
    },
  );

  it("has no tables Better Auth does not know about", () => {
    const known = Object.values(expected).map((t) => t.modelName);

    expect(Object.keys(tables).sort()).toEqual(known.sort());
  });

  it("stamps updated_at on update", () => {
    const { columns } = getTableConfig(schema.user);
    const updatedAt = columns.find((c) => c.name === "updated_at");

    expect(updatedAt?.onUpdateFn?.()).toBeInstanceOf(Date);
  });
});
