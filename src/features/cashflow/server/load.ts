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

/**
 * Everything the calendar home screen shows, for one workspace (F-12). Any
 * member may read it (ARCH-04); only editors get the day panel's form.
 */
export async function loadDashboard(workspaceId: unknown): Promise<Dashboard> {
  const session = await getSession();
  const access = await requireWorkspaceAccess(session, workspaceId, "viewer");
  const canEdit = roleAtLeast(access.role, "editor");
  if (canEdit) await ensureCategories(access.workspaceId);

  const today = isoDateIn(new Date(), DEFAULT_TIME_ZONE);
  const window = dashboardWindow(today);
  const [accounts, transactions, categories, linkState, recurring] =
    await Promise.all([
      listAccounts(access.workspaceId),
      listTransactionsBetween(access.workspaceId, window.from, window.to),
      listCategories(access.workspaceId),
      // The session is non-null here: requireWorkspaceAccess refused otherwise.
      getLinkState(session!.user.id),
      recurringFor(access.workspaceId),
    ]);

  return {
    workspaceId: access.workspaceId,
    data: {
      ...toCashflowData({ accounts, transactions, today }),
      recurring: recurring ? toRecurring(recurring.payments, accounts) : [],
    },
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
    suggestions: recurring?.summary.candidates ?? 0,
  };
}
