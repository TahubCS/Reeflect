// Drizzle schema (ADR-005, ARCH-03). Re-export each table file from here:
//   export * from "./financial-account";
// After changing the schema run `pnpm db:generate` and commit the migration
// in the same PR.
export * from "./auth";
export * from "./categorization";
export * from "./finance";
export * from "./messaging";
export * from "./synthetic";
export * from "./recurring";
