// Which Nessie ids belong to which demo customer, kept on the machine that
// runs the demo (gitignored). Seeding records every id as it is created,
// so a rerun after a failure resumes instead of duplicating: Nessie
// customers can't be deleted (ADR-048).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { AccountKey } from "@/features/synthetic";

export const MANIFEST_PATH = "scripts/nessie/.manifest.json";

export type DemoAction = {
  type: "purchase" | "deposit" | "refund" | "transfer";
  /** The record created; for a transfer, its withdrawal. */
  id: string;
  account: AccountKey;
  amount: number;
  date: string;
  description: string;
  /** A recurring purchase's Nessie bill. */
  billId?: string;
  /** A transfer's other side. */
  to?: AccountKey;
  depositId?: string;
};

export type CustomerEntry = {
  spec: string;
  person: string;
  seed: string;
  asOf: string;
  customerId: string | null;
  accounts: Partial<Record<AccountKey, string>>;
  /** Merchant name → Nessie merchant id. */
  merchants: Record<string, string>;
  /** Generated transaction id → Nessie record id. */
  records: Record<string, string>;
  actions: DemoAction[];
};

export type Manifest = {
  /** The customer commands act on without --name (`pnpm nessie use`). */
  current?: string;
  customers: Record<string, CustomerEntry>;
};

export function readManifest(path = MANIFEST_PATH): Manifest {
  if (!existsSync(path)) return { customers: {} };
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

export function writeManifest(manifest: Manifest, path = MANIFEST_PATH): void {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
