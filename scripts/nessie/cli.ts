// `pnpm nessie <command>`: put a synthetic customer's year into Capital
// One's Nessie sandbox, link it to a Reeflect user, and change it live
// during the demo (ADR-033, ADR-048, docs/NESSIE_PLAN.md). Nessie is the
// source of truth for linked accounts; the app's Sync now reads it back.
//
//   pnpm nessie seed <spec.json> --person <key> [--name "Maya Demo"] [--seed s] [--as-of YYYY-MM-DD]
//   pnpm nessie link --user <userId> [--name …] --target local|branch|production [--yes]
//   pnpm nessie status [--name …]
//   pnpm nessie customers                   (seeded customers; * marks the current one)
//   pnpm nessie use "<name>"                (later commands act on that customer)
//   pnpm nessie categories                 (keys for --category)
//   pnpm nessie demo purchase <dollars> <description…> [--account card] [--category dining]
//                             [--recurring [--from YYYY-MM-DD]]  (also a monthly Nessie bill)
//   pnpm nessie demo deposit <dollars> [description…] [--account checking] [--category income]
//   pnpm nessie demo transfer <dollars> --to savings|card [--account checking] [description…]
//   pnpm nessie demo refund [purchaseId]   (default: the last demo purchase not yet refunded)
//   pnpm nessie demo undo                  (undo the last demo action)
//   pnpm nessie demo list                  (demo actions and their Nessie ids)
//
// Every command takes [--name "Reeflect Demo"] to pick the customer;
// without it, the one chosen by `use`, else "Reeflect Demo".
//
// Never prints the key or a request URL. Never calls DELETE /data.
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";
import { nessieClient, NessieError } from "@/features/nessie/api";
import { planSeed } from "@/features/nessie/domain/seed-plan";
import { PRESET_CATEGORIES } from "@/features/categorization/client";
import { dateSchema, dayOf } from "@/features/recurring/client";
import {
  type AccountKey,
  expandSpec,
  parseSpec,
  planCategories,
} from "@/features/synthetic";
import { uuidv7 } from "@/lib/db/id";
import * as schema from "@/lib/db/schema";
import {
  parseDollars,
  toWholeDollarNumber,
  truncateToDollars,
} from "@/lib/money";
import { presetCategoryRows } from "../batch/rows";
import { connect, findPersonalWorkspace } from "../batch/store";
import {
  TargetError,
  assertWritable,
  loadLocalEnv,
  parseTargetName,
  resolveTarget,
} from "../db/target";
import { formatTarget } from "../db/whoami";
import {
  type CustomerEntry,
  type DemoAction,
  readManifest,
  writeManifest,
} from "./manifest";

const say = (line: string) => console.log(line);
const DEFAULT_NAME = "Reeflect Demo";
const INSTITUTION = "Capital One (Nessie sandbox)";
const CONCURRENCY = 8;

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function client() {
  loadLocalEnv();
  const key = process.env.NESSIE_API_KEY;
  if (!key || key === "replace-me")
    throw new TargetError("Set NESSIE_API_KEY in .env.local.");
  return nessieClient({ key });
}

/** Runs `work` over `items`, `CONCURRENCY` at a time. */
async function pool<T>(
  items: readonly T[],
  work: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

function expand(
  entry: Pick<CustomerEntry, "spec" | "person" | "seed" | "asOf">,
) {
  const parsed = parseSpec(JSON.parse(readFileSync(entry.spec, "utf8")));
  if (!parsed.ok) throw new TargetError(parsed.problems.join("\n"));
  const expansion = expandSpec(
    { ...parsed.spec, asOf: entry.asOf },
    { seed: entry.seed, wholeDollars: true },
  );
  const person = expansion.people.find((p) => p.key === entry.person);
  if (!person)
    throw new TargetError(
      `No person "${entry.person}" in ${entry.spec}. Keys: ${expansion.people.map((p) => p.key).join(", ")}`,
    );
  return person;
}

/** --name, else the customer chosen by `use`, else the default. */
function nameOf(flags: Flags): string {
  return flags.name ?? readManifest().current ?? DEFAULT_NAME;
}

function customers(): void {
  const manifest = readManifest();
  const names = Object.keys(manifest.customers);
  if (names.length === 0) return say("No customers yet: run seed first.");
  const current = manifest.current ?? DEFAULT_NAME;
  say("Nessie customers (* = current):");
  for (const name of names) {
    const entry = manifest.customers[name]!;
    say(
      `  ${name === current ? "*" : " "} ${name.padEnd(20)} ${entry.customerId ?? "(not created)"}  ${Object.keys(entry.accounts).join(", ")}`,
    );
  }
}

function chooseCustomer(args: string[]): void {
  const name = args.join(" ").trim();
  if (!name) throw new TargetError('Give a name: pnpm nessie use "Maya Demo".');
  const manifest = readManifest();
  const entry = manifest.customers[name];
  if (!entry)
    throw new TargetError(
      `No customer "${name}". Customers: ${Object.keys(manifest.customers).join(", ") || "none"}`,
    );
  manifest.current = name;
  writeManifest(manifest);
  say(`Now acting on "${name}" (Nessie customer ${entry.customerId}).`);
}

function customerOf(name: string): CustomerEntry {
  const entry = readManifest().customers[name];
  if (!entry)
    throw new TargetError(
      `No customer "${name}" in the manifest: run seed first.`,
    );
  return entry;
}

async function seed(args: string[], flags: Flags): Promise<void> {
  const name = flags.name ?? DEFAULT_NAME;
  const manifest = readManifest();
  const existing = manifest.customers[name];
  const entry: CustomerEntry = existing ?? {
    spec: args[0] ?? "",
    person: flags.person ?? "",
    seed: flags.seed ?? "nessie-demo-1",
    asOf: flags["as-of"] ?? today(),
    customerId: null,
    accounts: {},
    merchants: {},
    records: {},
    actions: [],
  };
  if (!entry.spec || !entry.person)
    throw new TargetError(
      "Usage: pnpm nessie seed <spec.json> --person <key> [--name …]",
    );
  if (existing)
    say(`Resuming "${name}" (spec, person and seed from the manifest).`);
  manifest.customers[name] = entry;
  const save = () => writeManifest(manifest);

  const person = expand(entry);
  const plan = planSeed(person);
  const api = client();
  const started = performance.now();

  try {
    if (!entry.customerId) {
      entry.customerId = await api.createCustomer({
        first_name: "Synthetic",
        last_name: name,
        address: {
          street_number: "1",
          street_name: "Demo St",
          city: "Chapel Hill",
          state: "NC",
          zip: "27514",
        },
      });
      save();
    }
    for (const account of plan.accounts) {
      if (entry.accounts[account.key]) continue;
      entry.accounts[account.key] = await api.createAccount(entry.customerId, {
        type: account.type,
        nickname: account.nickname,
        rewards: 0,
        balance: account.balance,
      });
      save();
    }
    await pool(
      plan.merchants.filter((m) => !entry.merchants[m.name]),
      async (m) => {
        entry.merchants[m.name] = await api.createMerchant({
          name: m.name,
          category: m.category,
          address: {
            street_number: "1",
            street_name: "Demo St",
            city: "Chapel Hill",
            state: "NC",
            zip: "27514",
          },
          geocode: { lat: 35.9, lng: -79.05 },
        });
      },
    );
    save();

    const todo = plan.records.filter((r) => !entry.records[r.sourceId]);
    say(
      `Customer ${entry.customerId}: ${plan.accounts.length} accounts, ${plan.merchants.length} merchants, ${todo.length} of ${plan.records.length} records to send.`,
    );
    let done = 0;
    await pool(todo, async (r) => {
      const accountId = entry.accounts[r.account]!;
      entry.records[r.sourceId] =
        r.kind === "purchase"
          ? await api.createRecord(accountId, "purchases", {
              ...r.body,
              merchant_id: entry.merchants[r.merchant]!,
            })
          : await api.createRecord(
              accountId,
              r.kind === "deposit" ? "deposits" : "withdrawals",
              r.body,
            );
      if (++done % 100 === 0) {
        save();
        say(`  ${done}/${todo.length}`);
      }
    });
  } finally {
    save();
  }
  say(
    `Done in ${((performance.now() - started) / 1000).toFixed(1)} s. Next: pnpm nessie link --name "${name}" --user <userId> --target …`,
  );
}

async function link(flags: Flags): Promise<void> {
  const name = nameOf(flags);
  const entry = customerOf(name);
  const userId = flags.user;
  if (!userId) throw new TargetError("Give --user <userId>.");
  loadLocalEnv();
  const target = resolveTarget(parseTargetName(flags.target), process.env);
  say(formatTarget(target, process.env).join("\n"));
  assertWritable(target, process.env);
  if (target.name === "production" && !flags.yes)
    throw new TargetError("Add --yes to write to production.");

  const person = expand(entry);
  const api = client();
  const nessieAccounts = await Promise.all(
    (Object.entries(entry.accounts) as [AccountKey, string][]).map(
      async ([key, id]) => ({ key, account: await api.getAccount(id) }),
    ),
  );
  const { db, close } = connect(target.url);
  try {
    const result = await db.transaction(async (tx) => {
      const workspaceId = await findPersonalWorkspace(tx, userId);
      if (!workspaceId)
        throw new TargetError(
          `User ${userId} has no Personal workspace: sign in once, then retry.`,
        );
      // Categories and exact-match rules, as `batch give` sets them up, so
      // synced rows are categorized by the workspace's own rules (ADR-057).
      const { categories } = presetCategoryRows(workspaceId, uuidv7);
      await tx.insert(schema.category).values(categories).onConflictDoNothing();
      const ids = new Map(
        (
          await tx
            .select({
              id: schema.category.id,
              presetKey: schema.category.presetKey,
            })
            .from(schema.category)
            .where(eq(schema.category.workspaceId, workspaceId))
        ).map((c) => [c.presetKey, c.id]),
      );
      const rules = planCategories(person.transactions).rules.map((r) => ({
        id: uuidv7(),
        workspaceId,
        pattern: r.pattern,
        matchType: "exact" as const,
        categoryId: ids.get(r.presetKey)!,
      }));
      if (rules.length > 0)
        await tx
          .insert(schema.categoryRule)
          .values(rules)
          .onConflictDoNothing();

      let linked = 0;
      for (const { key, account } of nessieAccounts) {
        if (!account) {
          say(`  ${key}: gone from Nessie, skipped`);
          continue;
        }
        const generated = person.accounts.find((a) => a.key === key);
        const inserted = await tx
          .insert(schema.financialAccount)
          .values({
            workspaceId,
            institutionName: INSTITUTION,
            type:
              account.type === "Credit Card"
                ? "credit_card"
                : account.type === "Savings"
                  ? "savings"
                  : "checking",
            maskLast4: generated?.mask ?? null,
            nickname: account.nickname,
            source: "nessie",
            // Balance and "last synced" arrive with the first sync.
            currentBalanceCents: 0,
            balanceAsOf: null,
            nessieAccountId: account._id,
          })
          .onConflictDoNothing()
          .returning({ id: schema.financialAccount.id });
        linked += inserted.length;
      }
      return { workspaceId, linked, rules: rules.length };
    });
    say(
      `Linked ${result.linked} account(s) to workspace ${result.workspaceId} (${result.rules} category rules). Open Accounts and press Sync now.`,
    );
  } finally {
    await close();
  }
}

async function status(flags: Flags): Promise<void> {
  const name = nameOf(flags);
  const entry = customerOf(name);
  const api = client();
  say(`"${name}": customer ${entry.customerId}`);
  for (const [key, id] of Object.entries(entry.accounts)) {
    const account = await api.getAccount(id);
    if (!account) {
      say(`  ${key}: deleted in Nessie`);
      continue;
    }
    const r = await api.accountRecords(account);
    say(
      `  ${key.padEnd(8)} ${account._id}  ${r.purchases.length} purchases, ${r.deposits.length} deposits, ${r.withdrawals.length} withdrawals`,
    );
  }
  say(`  ${entry.actions.length} demo action(s) logged.`);
}

function wholeDollars(text: string | undefined): number {
  const amount = text ? parseDollars(text) : null;
  if (amount === null)
    throw new TargetError("Give an amount, like 90 or 12.50.");
  const whole = truncateToDollars(amount);
  if (whole !== amount)
    say(`Nessie keeps whole dollars: sending $${toWholeDollarNumber(whole)}.`);
  if (whole === 0) throw new TargetError("The amount must be at least $1.");
  return toWholeDollarNumber(whole);
}

const ADDRESS = {
  street_number: "1",
  street_name: "Demo St",
  city: "Chapel Hill",
  state: "NC",
  zip: "27514",
};
const CATEGORY_KEYS: readonly string[] = PRESET_CATEGORIES.map((c) => c.key);

function categories(): void {
  say("Categories for --category (key: name):");
  for (const c of PRESET_CATEGORIES) say(`  ${c.key.padEnd(14)} ${c.name}`);
}

/** A `[cat:<key>]` tag the sync reads and hides, or "" when none is given. */
function categoryTag(key: string | undefined): string {
  if (key === undefined) return "";
  if (!CATEGORY_KEYS.includes(key))
    throw new TargetError(
      `Unknown category "${key}". Run pnpm nessie categories.`,
    );
  return ` [cat:${key}]`;
}

function accountOf(entry: CustomerEntry, key: string): [AccountKey, string] {
  const id = entry.accounts[key as AccountKey];
  if (!id)
    throw new TargetError(
      `No ${key} account. Accounts: ${Object.keys(entry.accounts).join(", ")}`,
    );
  return [key as AccountKey, id];
}

async function demo(args: string[], flags: Flags): Promise<void> {
  const [action, amountText, ...words] = args;
  const name = nameOf(flags);
  const manifest = readManifest();
  const entry = manifest.customers[name];
  if (!entry) throw new TargetError(`No customer "${name}": run seed first.`);
  if (action === "list") return listActions(entry);
  const api = client();
  const date = today();
  const save = () => writeManifest(manifest);
  const log = (a: DemoAction) => {
    entry.actions.push(a);
    save();
    say(
      `"${name}": Nessie created ${a.type} ${a.id} on ${a.account}${a.to ? ` → ${a.to}` : ""} ($${a.amount}, ${a.date}).`,
    );
    say("Now press Sync now in the app.");
  };
  const deposit = (accountId: string, amount: number, description: string) =>
    api.createRecord(accountId, "deposits", {
      medium: "balance",
      transaction_date: date,
      amount,
      status: "completed",
      description,
    });
  const withdrawal = (accountId: string, amount: number, description: string) =>
    api.createRecord(accountId, "withdrawals", {
      medium: "balance",
      transaction_date: date,
      amount,
      status: "completed",
      description,
    });
  /** Both sides of a transfer, tagged as one pair (ADR-020). */
  const transfer = async (
    from: [AccountKey, string],
    to: [AccountKey, string],
    amount: number,
    description: string,
  ) => {
    const tag = ` [xfer:demo-${Date.now().toString(36)}]`;
    const id = await withdrawal(from[1], amount, description + tag);
    const depositId = await deposit(to[1], amount, description + tag);
    return { id, depositId };
  };

  switch (action) {
    case "purchase": {
      const [accountKey, accountId] = accountOf(entry, flags.account ?? "card");
      const amount = wholeDollars(amountText);
      const description = words.join(" ") || "Demo purchase";
      const tag = categoryTag(flags.category);
      const start = flags.from ?? date;
      if (flags.recurring && !dateSchema.safeParse(start).success)
        throw new TargetError("--from must be a date like 2026-11-01.");
      const merchant =
        entry.merchants[description] ??
        (entry.merchants[description] = await api.createMerchant({
          name: description,
          category: flags.category ?? "other",
          address: ADDRESS,
          geocode: { lat: 35.9, lng: -79.05 },
        }));
      const id = await api.createRecord(accountId, "purchases", {
        merchant_id: merchant,
        medium: "balance",
        purchase_date: date,
        amount,
        status: "completed",
        description: description + tag,
      });
      let billId: string | undefined;
      if (flags.recurring) {
        // Monthly on the start date's day, from --from (default today).
        billId = await api.createBill(accountId, {
          status: "recurring",
          payee: description,
          nickname: description + tag,
          payment_date: start,
          recurring_date: dayOf(start),
          payment_amount: amount,
        });
        say(
          `Nessie created bill ${billId}: $${amount} monthly on day ${dayOf(start)} from ${start}.`,
        );
      }
      return log({
        type: "purchase",
        id,
        account: accountKey,
        amount,
        date,
        description,
        billId,
      });
    }
    case "deposit": {
      const [accountKey, accountId] = accountOf(
        entry,
        flags.account ?? "checking",
      );
      const amount = wholeDollars(amountText);
      const description = words.join(" ") || "Demo deposit";
      const id = await deposit(
        accountId,
        amount,
        description + categoryTag(flags.category),
      );
      return log({
        type: "deposit",
        id,
        account: accountKey,
        amount,
        date,
        description,
      });
    }
    case "transfer": {
      if (!flags.to)
        throw new TargetError(
          "Give --to savings|card (and --account to move from).",
        );
      const from = accountOf(entry, flags.account ?? "checking");
      const to = accountOf(entry, flags.to);
      if (from[0] === to[0])
        throw new TargetError("--to must be a different account.");
      const amount = wholeDollars(amountText);
      const description =
        words.join(" ") ||
        (to[0] === "card" ? "Credit card payment" : `Transfer to ${to[0]}`);
      const { id, depositId } = await transfer(from, to, amount, description);
      return log({
        type: "transfer",
        id,
        depositId,
        account: from[0],
        to: to[0],
        amount,
        date,
        description,
      });
    }
    case "refund": {
      const purchase = findPurchase(entry, amountText);
      const id = await deposit(
        entry.accounts[purchase.account]!,
        purchase.amount,
        `Refund: ${purchase.description} [refund:${purchase.id}]`,
      );
      return log({
        type: "refund",
        id,
        account: purchase.account,
        amount: purchase.amount,
        date,
        description: `Refund: ${purchase.description} [refund:${purchase.id}]`,
      });
    }
    case "undo": {
      const last = entry.actions.at(-1);
      if (!last)
        throw new TargetError(`No demo actions to undo for "${name}".`);
      say(`"${name}": undoing ${last.type} ${last.id}.`);
      switch (last.type) {
        case "purchase": {
          // Nessie can't delete a purchase (ADR-048): refund it instead.
          const refundId = await deposit(
            entry.accounts[last.account]!,
            last.amount,
            `Refund: ${last.description} [refund:${last.id}]`,
          );
          say(`Refunded purchase ${last.id} with deposit ${refundId}.`);
          if (last.billId) {
            await api.deleteBill(last.billId);
            say(`Deleted bill ${last.billId}.`);
          }
          break;
        }
        case "deposit":
        case "refund":
          await api.deleteDeposit(last.id);
          say(`Deleted ${last.type} ${last.id}.`);
          break;
        case "transfer": {
          // Withdrawals can't be deleted either: move the money back.
          const back = await transfer(
            accountOf(entry, last.to!),
            accountOf(entry, last.account),
            last.amount,
            `Reversal: ${last.description}`,
          );
          say(
            `Reversed transfer ${last.id}: ${last.to} → ${last.account} (${back.id}, ${back.depositId}).`,
          );
          break;
        }
      }
      entry.actions.pop();
      save();
      say("Now press Sync now in the app.");
      return;
    }
    default:
      throw new TargetError(
        "Usage: pnpm nessie demo <purchase|deposit|transfer|refund|undo|list> … (see scripts/nessie/cli.ts)",
      );
  }
}

/** The purchase a refund applies to: by id, or the last one not refunded. */
function findPurchase(entry: CustomerEntry, id: string | undefined) {
  const refunded = new Set(
    entry.actions
      .filter((a) => a.type === "refund")
      .map((a) => /\[refund:([^\]]+)\]/.exec(a.description)?.[1]),
  );
  const purchases = entry.actions.filter((a) => a.type === "purchase");
  const purchase = id
    ? purchases.find((a) => a.id === id)
    : purchases.findLast((a) => !refunded.has(a.id));
  if (!purchase)
    throw new TargetError(
      id
        ? `No demo purchase ${id}: see pnpm nessie demo list.`
        : "No demo purchase left to refund.",
    );
  return purchase;
}

function listActions(entry: CustomerEntry): void {
  if (entry.actions.length === 0) return say("No demo actions yet.");
  say("Demo actions, oldest first (undo takes the last one):");
  for (const a of entry.actions)
    say(
      `  ${a.date}  ${a.type.padEnd(8)} $${String(a.amount).padStart(5)}  ${a.account}${a.to ? ` → ${a.to}` : ""}  ${a.description}  ${a.id}${a.billId ? `  (monthly bill ${a.billId})` : ""}`,
    );
}

type Flags = {
  name?: string;
  person?: string;
  seed?: string;
  "as-of"?: string;
  user?: string;
  target?: string;
  account?: string;
  category?: string;
  recurring?: boolean;
  from?: string;
  to?: string;
  yes?: boolean;
};

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      name: { type: "string" },
      person: { type: "string" },
      seed: { type: "string" },
      "as-of": { type: "string" },
      user: { type: "string" },
      target: { type: "string" },
      account: { type: "string" },
      category: { type: "string" },
      recurring: { type: "boolean" },
      from: { type: "string" },
      to: { type: "string" },
      yes: { type: "boolean" },
    },
  });
  const [command, ...args] = positionals;
  switch (command) {
    case "seed":
      return seed(args, values);
    case "link":
      return link(values);
    case "status":
      return status(values);
    case "customers":
      return customers();
    case "use":
      return chooseCustomer(args);
    case "categories":
      return categories();
    case "demo":
      return demo(args, values);
    default:
      say(
        "Usage: pnpm nessie <seed|link|status|customers|use|categories|demo> … (see scripts/nessie/cli.ts)",
      );
      process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  if (error instanceof TargetError || error instanceof NessieError) {
    console.error(error.message);
  } else {
    // A database error can quote the connection string: print its kind only.
    const code = (error as { code?: unknown })?.code;
    console.error(
      `Failed: ${error instanceof Error ? error.name : "unknown error"}${code ? ` (${String(code)})` : ""}`,
    );
  }
  process.exitCode = 1;
});
