import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import { uuidv7 } from "@/lib/db/id";
import { financialAccount, transaction } from "@/lib/db/schema";
import {
  hasBillEvidence,
  lockLedgerWorkspace,
  type LedgerTx,
} from "@/lib/db/transaction-guards";
import { cents, negate } from "@/lib/money";
import {
  MATCH_CAP,
  PAGE_SIZE,
  PAIR_CAP,
  eligible,
  matchesFacts,
  matchesState,
  pairStatus,
  shiftDay,
  writeSchema,
  type ReviewQuery,
  type ReviewRow,
  type ReviewWrite,
  type RowReview,
  type WriteResult,
} from "../domain/review";

const columns = {
  id: transaction.id,
  workspaceId: transaction.workspaceId,
  accountId: transaction.financialAccountId,
  postedOn: transaction.postedOn,
  amountCents: transaction.amountCents,
  description: transaction.descriptionRaw,
  status: transaction.status,
  isTransfer: transaction.isTransfer,
  pairId: transaction.transferPairId,
  updatedAt: sql<string>`to_char(${transaction.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  accountName: financialAccount.nickname,
  accountType: financialAccount.type,
};
const joinAccount = and(
  eq(financialAccount.id, transaction.financialAccountId),
  eq(financialAccount.workspaceId, transaction.workspaceId),
);
type Stored = Omit<ReviewRow, "ownedAccount" | "accountName"> & {
  accountName: string | null;
};
const readable = (row: Stored): ReviewRow => ({
  ...row,
  accountName: row.accountName ?? "Account unavailable",
  ownedAccount: row.accountName !== null,
});
const queryRows = (tx: LedgerTx | typeof db) =>
  tx.select(columns).from(transaction).leftJoin(financialAccount, joinAccount);
const inWorkspace = (workspaceId: string) =>
  eq(transaction.workspaceId, workspaceId);

/** One consistent, bounded snapshot; reads never change classification. */
export async function readReview(
  workspaceId: string,
  query: ReviewQuery,
  today: string,
) {
  return db.transaction(
    async (tx) => {
      const accounts = await tx
        .select({ id: financialAccount.id, name: financialAccount.nickname })
        .from(financialAccount)
        .where(eq(financialAccount.workspaceId, workspaceId))
        .orderBy(asc(financialAccount.id))
        .limit(1001);
      if (accounts.length > 1000)
        throw new Error("Refine the workspace account scope");
      const selected = await queryRows(tx)
        .where(
          and(
            inWorkspace(workspaceId),
            gte(transaction.postedOn, query.from),
            lte(transaction.postedOn, query.to),
            query.account
              ? eq(transaction.financialAccountId, query.account)
              : undefined,
            query.source ? eq(transaction.id, query.source) : undefined,
            !query.source && query.view === "pairs"
              ? isNotNull(transaction.transferPairId)
              : undefined,
            !query.source && query.view === "individual"
              ? and(
                  eq(transaction.isTransfer, true),
                  isNull(transaction.transferPairId),
                )
              : undefined,
            !query.source && query.view === "review"
              ? and(
                  eq(transaction.isTransfer, false),
                  isNull(transaction.transferPairId),
                )
              : undefined,
          ),
        )
        .orderBy(desc(transaction.postedOn), asc(transaction.id))
        .limit(PAGE_SIZE + 1)
        .offset(query.source ? 0 : (query.page - 1) * PAGE_SIZE);
      const rows: RowReview[] = [];
      for (const row of selected.slice(0, PAGE_SIZE).map(readable)) {
        let members: ReviewRow[] = [],
          candidates: ReviewRow[] = [];
        let groupLimited = false,
          matchesLimited = false;
        if (row.pairId !== null) {
          members = (
            await queryRows(tx)
              .where(
                and(
                  inWorkspace(workspaceId),
                  eq(transaction.transferPairId, row.pairId),
                ),
              )
              .orderBy(asc(transaction.id))
              .limit(PAIR_CAP + 1)
          ).map(readable);
          groupLimited = members.length > PAIR_CAP;
        } else if (
          row.ownedAccount &&
          row.status === "posted" &&
          row.postedOn <= today &&
          Number.isSafeInteger(row.amountCents) &&
          row.amountCents !== 0
        ) {
          candidates = (
            await queryRows(tx)
              .where(
                and(
                  inWorkspace(workspaceId),
                  isNotNull(financialAccount.id),
                  isNull(transaction.transferPairId),
                  eq(transaction.status, "posted"),
                  eq(transaction.amountCents, negate(cents(row.amountCents))),
                  ne(transaction.financialAccountId, row.accountId),
                  gte(transaction.postedOn, shiftDay(row.postedOn, -3)),
                  lte(transaction.postedOn, shiftDay(row.postedOn, 3)),
                  lte(transaction.postedOn, today),
                  query.other
                    ? eq(transaction.financialAccountId, query.other)
                    : undefined,
                ),
              )
              .orderBy(asc(transaction.postedOn), asc(transaction.id))
              .limit(MATCH_CAP + 1)
          ).map(readable);
          matchesLimited = candidates.length > MATCH_CAP;
        }
        rows.push({
          row,
          members,
          groupLimited,
          matchesLimited,
          pairStatus: row.pairId === null ? null : pairStatus(members, today),
          candidateCount: candidates.length,
          candidates: matchesLimited
            ? []
            : candidates.slice(
                (query.source ? query.matchPage - 1 : 0) * PAGE_SIZE,
                (query.source ? query.matchPage : 1) * PAGE_SIZE,
              ),
        });
      }
      return { accounts, rows, hasMore: selected.length > PAGE_SIZE };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

async function lockedRows(
  tx: LedgerTx,
  workspaceId: string,
  ids: string[],
): Promise<ReviewRow[]> {
  // Lock only transactions (a nullable account join cannot be FOR UPDATE).
  const locked = await tx
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(inWorkspace(workspaceId), inArray(transaction.id, [...ids].sort())),
    )
    .orderBy(asc(transaction.id))
    .for("update");
  if (!locked.length) return [];
  return (
    await queryRows(tx)
      .where(
        and(
          inWorkspace(workspaceId),
          inArray(
            transaction.id,
            locked.map((r) => r.id),
          ),
        ),
      )
      .orderBy(asc(transaction.id))
  ).map(readable);
}
/** Metadata only. Caller authorizes editor access; every lookup is scoped. */
export async function writeReview(
  workspaceId: string,
  input: ReviewWrite,
  today: string,
): Promise<WriteResult> {
  writeSchema.parse(input);
  if (new Set(input.expected.map((r) => r.id)).size !== input.expected.length)
    return "ineligible";
  return db.transaction(async (tx) => {
    await lockLedgerWorkspace(tx, workspaceId);
    let ids = input.expected.map((r) => r.id);
    if (input.operation === "detach") {
      const pairId = input.expected[0]!.pairId;
      if (pairId === null || !input.expected.every((r) => r.pairId === pairId))
        return "ineligible";
      const group = await tx
        .select({ id: transaction.id })
        .from(transaction)
        .where(
          and(inWorkspace(workspaceId), eq(transaction.transferPairId, pairId)),
        )
        .orderBy(asc(transaction.id))
        .limit(PAIR_CAP + 1);
      if (group.length > PAIR_CAP) return "limit";
      ids = group.map((r) => r.id);
      if (
        ids.length !== input.expected.length ||
        !ids.every((id) => input.expected.some((r) => r.id === id))
      )
        return "stale";
    }
    const rows = await lockedRows(tx, workspaceId, ids);
    if (rows.length !== input.expected.length) return "not_found";
    const unchanged = rows.every((r) =>
      matchesState(
        r,
        input.expected.find((e) => e.id === r.id)!,
      ),
    );
    if (input.operation === "pair") {
      const [a, b] = rows as [ReviewRow, ReviewRow];
      if (
        a.pairId !== null &&
        a.pairId === b.pairId &&
        a.isTransfer &&
        b.isTransfer &&
        eligible(a, b, today, true) &&
        rows.every((r) =>
          matchesFacts(
            r,
            input.expected.find((e) => e.id === r.id)!,
          ),
        )
      ) {
        const count = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(transaction)
          .where(
            and(
              inWorkspace(workspaceId),
              eq(transaction.transferPairId, a.pairId),
            ),
          );
        return count[0]?.n === 2 ? "already" : "paired";
      }
      if (!unchanged) return "stale";
      if (!eligible(a, b, today)) return "ineligible";
      if (
        await hasBillEvidence(
          tx,
          workspaceId,
          rows.filter((r) => !r.isTransfer).map((r) => r.id),
        )
      )
        return "allocated";
      await tx
        .update(transaction)
        .set({
          isTransfer: true,
          transferPairId: uuidv7(),
          updatedAt: new Date(),
        })
        .where(and(inWorkspace(workspaceId), inArray(transaction.id, ids)));
    } else {
      if (!unchanged) return "stale";
      if (input.operation === "detach") {
        await tx
          .update(transaction)
          .set({ transferPairId: null, updatedAt: new Date() })
          .where(and(inWorkspace(workspaceId), inArray(transaction.id, ids)));
      } else {
        const row = rows[0]!;
        if (row.pairId !== null) return "paired";
        if (row.isTransfer === input.transfer) return "already";
        if (await hasBillEvidence(tx, workspaceId, ids)) return "allocated";
        await tx
          .update(transaction)
          .set({ isTransfer: input.transfer, updatedAt: new Date() })
          .where(and(inWorkspace(workspaceId), eq(transaction.id, row.id)));
      }
    }
    return "ok";
  });
}
