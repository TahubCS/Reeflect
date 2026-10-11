// A synthetic person (ADR-049) as the Nessie records that hold their year.
// Pure: `scripts/nessie` sends the plan. The generator must run with
// `wholeDollars: true`, because Nessie drops cents (ADR-048).
import type {
  AccountKey,
  GeneratedPerson,
  GeneratedTransaction,
} from "@/features/synthetic";
import { absolute, negate, toWholeDollarNumber } from "@/lib/money";
import type { NESSIE_ACCOUNT_TYPES } from "./records";

export type PlannedAccount = {
  key: AccountKey;
  type: (typeof NESSIE_ACCOUNT_TYPES)[number];
  nickname: string;
  /** Opening balance in whole dollars; on a card, what is owed. */
  balance: number;
};

export type PlannedMerchant = { name: string; category: string };

export type PlannedRecord = {
  /** The generator's id: stable for the same spec and seed. */
  sourceId: string;
  account: AccountKey;
} & (
  | {
      kind: "purchase";
      merchant: string;
      body: {
        medium: "balance";
        purchase_date: string;
        amount: number;
        status: "completed";
        description: string;
      };
    }
  | {
      kind: "deposit" | "withdrawal";
      body: {
        medium: "balance";
        transaction_date: string;
        amount: number;
        status: "completed";
        description: string;
      };
    }
);

export type SeedPlan = {
  accounts: PlannedAccount[];
  merchants: PlannedMerchant[];
  records: PlannedRecord[];
};

const NESSIE_TYPE = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
} as const;

/** Spending at a named place becomes a purchase; other money out a withdrawal. */
const PURCHASE_KINDS = new Set<GeneratedTransaction["kind"]>([
  "everyday",
  "event",
  "subscription",
]);

export function planSeed(person: GeneratedPerson): SeedPlan {
  const accounts = person.accounts.map((a) => ({
    key: a.key,
    type: NESSIE_TYPE[a.type],
    nickname: a.nickname,
    balance: toWholeDollarNumber(
      a.type === "credit_card" ? negate(a.openingBalance) : a.openingBalance,
    ),
  }));

  const merchants = new Map<string, PlannedMerchant>();
  const records: PlannedRecord[] = [];
  const ordered = [...person.transactions].sort(
    (a, b) => a.postedOn.localeCompare(b.postedOn) || a.id.localeCompare(b.id),
  );
  for (const t of ordered) {
    const amount = toWholeDollarNumber(absolute(t.amount));
    const description = t.transferPair
      ? `${t.description} [xfer:${t.transferPair}]`
      : t.description;
    const base = { sourceId: t.id, account: t.account };
    if (t.amount < 0 && !t.transferPair && PURCHASE_KINDS.has(t.kind)) {
      if (!merchants.has(t.description))
        merchants.set(t.description, {
          name: t.description,
          category: t.category,
        });
      records.push({
        ...base,
        kind: "purchase",
        merchant: t.description,
        body: {
          medium: "balance",
          purchase_date: t.postedOn,
          amount,
          status: "completed",
          description,
        },
      });
    } else {
      records.push({
        ...base,
        kind: t.amount < 0 ? "withdrawal" : "deposit",
        body: {
          medium: "balance",
          transaction_date: t.postedOn,
          amount,
          status: "completed",
          description,
        },
      });
    }
  }
  return { accounts, merchants: [...merchants.values()], records };
}
