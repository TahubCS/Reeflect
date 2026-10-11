// Nessie records → our transaction rows (ADR-033). Pure.
//
// Nessie transfers can't name the other account (ADR-048 findings), so the
// seed writes both sides as a withdrawal and a deposit tagged
// `[xfer:<pair>]` in the description. A refund posted to undo a purchase is
// tagged `[refund:<purchaseId>]`, and a demo record can name its category
// with `[cat:<preset key>]`. Tags are read here and removed from what the
// user sees.
import { type Cents, add, fromDollarNumber, negate, sum } from "@/lib/money";
import type { AccountRecords, NessieAccount } from "./records";

export type SyncedRow = {
  /** `<kind>:<nessie id>`: unique within one account. */
  externalId: string;
  fingerprint: string;
  postedOn: string;
  amountCents: Cents;
  descriptionRaw: string;
  status: "pending" | "posted";
  isTransfer: boolean;
  transferPairId: string | null;
  /** A preset category key from a `[cat:…]` tag, applied after sync. */
  categoryKey: string | null;
  /**
   * The Nessie purchase this deposit gives money back for, from a
   * `[refund:…]` tag. Both rows stay; after sync the refund takes the
   * purchase's category, so it nets against that spending instead of
   * counting as pay.
   */
  refundOf: string | null;
};

export type OurAccountType = "checking" | "savings" | "credit_card";

export const ACCOUNT_TYPE_FROM_NESSIE: Record<
  NessieAccount["type"],
  OurAccountType
> = {
  Checking: "checking",
  Savings: "savings",
  "Credit Card": "credit_card",
};

const TAG = /\s*\[(xfer|refund|cat):([^\]\s]+)\]\s*/g;

/** The description without tags, with the transfer pair, category and refund. */
export function readTags(description: string): {
  text: string;
  transferPair: string | null;
  category: string | null;
  refundOf: string | null;
} {
  let transferPair: string | null = null;
  let category: string | null = null;
  let refundOf: string | null = null;
  for (const match of description.matchAll(TAG)) {
    if (match[1] === "xfer") transferPair = match[2]!;
    if (match[1] === "cat") category = match[2]!;
    if (match[1] === "refund") refundOf = match[2]!;
  }
  return {
    text: description.replace(TAG, " ").replace(/\s+/g, " ").trim(),
    transferPair,
    category,
    refundOf,
  };
}

function rowStatus(status: string): SyncedRow["status"] | null {
  const s = status.toLowerCase();
  if (s === "cancelled" || s === "canceled") return null;
  return s === "pending" ? "pending" : "posted";
}

function row(
  kind: "purchase" | "deposit" | "withdrawal",
  record: { _id: string; amount: number; status: string },
  postedOn: string,
  description: string,
  sign: 1 | -1,
): SyncedRow | null {
  const status = rowStatus(record.status);
  if (!status) return null;
  const magnitude = fromDollarNumber(Math.abs(record.amount));
  const { text, transferPair, category, refundOf } = readTags(description);
  const externalId = `${kind}:${record._id}`;
  return {
    externalId,
    fingerprint: `nessie:${externalId}`,
    postedOn,
    amountCents: sign === 1 ? magnitude : negate(magnitude),
    descriptionRaw: text || kind,
    status,
    isTransfer: transferPair !== null,
    transferPairId: transferPair ? `nessie:${transferPair}` : null,
    categoryKey: category,
    // Only money coming back is a refund; a tag on anything else is ignored.
    refundOf: sign === 1 ? refundOf : null,
  };
}

/**
 * One account's records as rows, signed from the holder's view (ADR-008):
 * deposits are money in (a payment on a card), purchases and withdrawals
 * money out (more owed on a card).
 */
export function mapAccountRecords(
  records: AccountRecords,
  merchantNames: ReadonlyMap<string, string> = new Map(),
): SyncedRow[] {
  const rows: (SyncedRow | null)[] = [
    ...records.purchases.map((p) =>
      row(
        "purchase",
        p,
        p.purchase_date,
        p.description ||
          (p.merchant_id && merchantNames.get(p.merchant_id)) ||
          "",
        -1,
      ),
    ),
    ...records.deposits.map((d) =>
      row("deposit", d, d.transaction_date, d.description ?? "", 1),
    ),
    ...records.withdrawals.map((w) =>
      row("withdrawal", w, w.transaction_date, w.description ?? "", -1),
    ),
  ];
  return rows
    .filter((r): r is SyncedRow => r !== null)
    .sort(
      (a, b) =>
        a.postedOn.localeCompare(b.postedOn) ||
        a.externalId.localeCompare(b.externalId),
    );
}

/**
 * Nessie never changes an account's balance after it is created (ADR-048),
 * so its `balance` is the opening balance and we add the rows ourselves.
 * On a card the seed sends what is owed as a positive number.
 */
export function computedBalance(
  account: NessieAccount,
  rows: readonly SyncedRow[],
): Cents {
  const opening = fromDollarNumber(account.balance);
  const signedOpening =
    account.type === "Credit Card" ? negate(opening) : opening;
  return add(
    signedOpening,
    sum(rows.filter((r) => r.status === "posted").map((r) => r.amountCents)),
  );
}

/**
 * Refund rows to give their purchase's category: refund fingerprint →
 * the purchase's external id. A refund with its own `[cat:…]` tag keeps it.
 */
export function refundTargets(rows: readonly SyncedRow[]): Map<string, string> {
  return new Map(
    rows
      .filter((r) => r.refundOf !== null && r.categoryKey === null)
      .map((r) => [r.fingerprint, `purchase:${r.refundOf}`]),
  );
}
