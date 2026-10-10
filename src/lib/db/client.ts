import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

// node-postgres works with Neon's pooled connection string, local Docker and
// the CI service container alike, and supports transactions (ADR-005, ADR-010).
export const db = drizzle({
  connection: serverEnv().DATABASE_URL,
  schema,
});
