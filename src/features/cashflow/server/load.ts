import "server-only";
import { DEFAULT_TIME_ZONE } from "@/config/app";
import { isoDateIn, listAccounts } from "@/features/accounts";
import { ensureCategories, listCategories } from "@/features/categorization";
import { type LinkState, getLinkState } from "@/features/messaging";
import { listRecurringPayments } from "@/features/recurring";
import {
  type AccountChoice,
  listTransactionsBetween,
} from "@/features/transactions";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { roleAtLeast } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";
import type { CashflowData } from "../domain/cashflow";
import type { IsoDate } from "../domain/dates";
import { toRecurring } from "../domain/from-payments";
import { dashboardWindow, toCashflowData } from "../domain/from-records";

export type DashboardCategory = { id: string; name: string };

export type Dashboard = {
  workspaceId: string;
  data: CashflowData;
  today: IsoDate;
  accounts: AccountChoice[];
  /** Spending categories the day panel offers; Income is left out. */
  categories: DashboardCategory[];
  canEdit: boolean;
  linkState: LinkState;
  /** Recurring payments waiting for the person to confirm them (ADR-058). */
  suggestions: number;
};

/**
 * Recurring payments for the calendar. If that read fails (for example past
 * its history bound), the calendar still shows the month without them; the
 * Recurring payments page shows its own retry state.
 */
async function recurringFor(workspaceId: string) {
  try {
    return await listRecurringPayments(workspaceId);
  } catch {
    console.error("cashflow: recurring payments unavailable", { workspaceId });
    return null;
  }
}

export type CashflowLoad = {
  data: CashflowData;
  today: IsoDate;
  accounts: Awaited<ReturnType<typeof listAccounts>>;
  /** Recurring payments waiting for the person to confirm them (ADR-058). */
  suggestions: number;
};

/**
 * The calendar's data for one workspace, as of today in the app's time
 * zone. It checks no session: the caller has already established that the
 * reader may see `workspaceId` (the dashboard through membership, the agent
 * through a verified phone link, ADR-034). Both get the same figures.
 */
export async function loadCashflowData(
  workspaceId: string,
  now: Date = new Date(),
): Promise<CashflowLoad> {
  const today = isoDateIn(now, DEFAULT_TIME_ZONE);
  const window = dashboardWindow(today);
  const [accounts, transactions, recurring] = await Promise.all([
    listAccounts(workspaceId),
    listTransactionsBetween(workspaceId, window.from, window.to),
    recurringFor(workspaceId),
  ]);
  return {
    data: {
      ...toCashflowData({ accounts, transactions, today }),
      recurring: recurring ? toRecurring(recurring.payments, accounts) : [],
    },
    today,
    accounts,
    suggestions: recurring?.summary.candidates ?? 0,
  };
}

/**
 * Everything the calendar home screen shows, for one workspace (F-12). Any
 * member may read it (ARCH-04); only editors get the day panel's form.
 */
export async function loadDashboard(workspaceId: unknown): Promise<Dashboard> {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "viewer");
  const canEdit = roleAtLeast(access.role, "editor");
  if (canEdit) await ensureCategories(access.workspaceId);

  const [{ data, today, accounts, suggestions }, categories, linkState] =
    await Promise.all([
      loadCashflowData(access.workspaceId),
      listCategories(access.workspaceId),
      // The session is non-null here: requireWorkspaceAccess refused otherwise.
      getLinkState(session!.user.id),
    ]);

  return {
    workspaceId: access.workspaceId,
    data,
    today,
    accounts: accounts.map(({ id, nickname, type }) => ({
      id,
      nickname,
      type,
    })),
    categories: categories
      .filter((category) => category.presetKey !== "income")
      .map(({ id, name }) => ({ id, name })),
    canEdit,
    linkState,
    suggestions,
  };
}
