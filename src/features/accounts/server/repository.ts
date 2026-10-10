import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { db } from "@/lib/db/client";
import { financialAccount } from "@/lib/db/schema";
import { cents } from "@/lib/money";
import {
  type AccountInput,
  type AccountSummary,
  isoDateIn,
} from "../domain/account-input";

// Every function takes the verified workspace id first and filters on it
// (ARCH-04). Callers authorize with `requireWorkspaceAccess` before calling.

type Row = Omit<AccountSummary, "balanceCents" | "balanceEditable"> & {
  balanceCents: number;
};

const columns = {
  id: financialAccount.id,
  type: financialAccount.type,
  institutionName: financialAccount.institutionName,
  nickname: financialAccount.nickname,
  maskLast4: financialAccount.maskLast4,
  balanceCents: financialAccount.currentBalanceCents,
  balanceAsOf: financialAccount.balanceAsOf,
  source: financialAccount.source,
};

function toSummary(row: Row): AccountSummary {
  return {
    ...row,
    balanceCents: cents(row.balanceCents),
    balanceEditable: row.source === "manual",
  };
}

const inWorkspace = (workspaceId: string, accountId: string) =>
  and(
    eq(financialAccount.workspaceId, workspaceId),
    eq(financialAccount.id, accountId),
  );

/** The workspace's accounts, oldest first. */
export async function listAccounts(
  workspaceId: string,
): Promise<AccountSummary[]> {
  const rows = await db
    .select(columns)
    .from(financialAccount)
    .where(eq(financialAccount.workspaceId, workspaceId))
    .orderBy(asc(financialAccount.createdAt), asc(financialAccount.id));
  return rows.map(toSummary);
}

export async function getAccount(
  workspaceId: string,
  accountId: string,
): Promise<AccountSummary | null> {
  const [row] = await db
    .select(columns)
    .from(financialAccount)
    .where(inWorkspace(workspaceId, accountId));
  return row ? toSummary(row) : null;
}

/** Adds a manually entered account; its balance is as of today. */
export async function createAccount(
  workspaceId: string,
  input: AccountInput,
  now: Date = new Date(),
): Promise<string> {
  const [row] = await db
    .insert(financialAccount)
    .values({
      workspaceId,
      type: input.type,
      institutionName: input.institutionName,
      nickname: input.nickname,
      maskLast4: input.maskLast4,
      source: "manual",
      currentBalanceCents: input.balanceCents ?? 0,
      balanceAsOf: isoDateIn(now, DEFAULT_TIME_ZONE),
    })
    .returning({ id: financialAccount.id });
  return row!.id;
}

/**
 * Updates an account's details. The type and balance change only on a
 * manual account, and the balance only when `input.balanceCents` is set.
 * False when the account is not in this workspace.
 */
export async function updateAccount(
  workspaceId: string,
  accountId: string,
  input: AccountInput,
  now: Date = new Date(),
): Promise<boolean> {
  const existing = await getAccount(workspaceId, accountId);
  if (!existing) return false;

  const manual = existing.balanceEditable
    ? {
        type: input.type,
        ...(input.balanceCents !== null && {
          currentBalanceCents: input.balanceCents,
          balanceAsOf: isoDateIn(now, DEFAULT_TIME_ZONE),
        }),
      }
    : {};
  const updated = await db
    .update(financialAccount)
    .set({
      institutionName: input.institutionName,
      nickname: input.nickname,
      maskLast4: input.maskLast4,
      ...manual,
    })
    .where(inWorkspace(workspaceId, accountId))
    .returning({ id: financialAccount.id });
  return updated.length === 1;
}

/**
 * Deletes an account and, by cascade, its transactions (ADR-025). False when
 * the account is not in this workspace.
 */
export async function deleteAccount(
  workspaceId: string,
  accountId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(financialAccount)
    .where(inWorkspace(workspaceId, accountId))
    .returning({ id: financialAccount.id });
  return deleted.length === 1;
}
