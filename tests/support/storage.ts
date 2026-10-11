// The statements bucket for Vitest integration tests: a Neon branch's
// bucket (ADR-053), the `storage-tests` branch locally and in CI. Keys are
// under random workspace ids, so runs side by side never collide.
import { type ObjectStore, statementStore } from "@/lib/storage";

export const STORAGE_SETUP =
  "Neon storage for tests isn't configured. Run `neon env pull --project-id small-tree-10245355 --branch storage-tests --file .env.storage-tests` and add STATEMENTS_BUCKET=statements to that file (docs/TESTING.md, TEST-05).";

export function testStore(): ObjectStore {
  const store = statementStore();
  if (!store) throw new Error(STORAGE_SETUP);
  return store;
}
