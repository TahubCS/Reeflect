import "server-only";
import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/roles";
import { coverage, isSettled } from "../domain/cycles";
import { querySchema } from "../domain/forms";
import { paymentCandidates, readBills } from "./repository";

export async function loadBills(
  workspaceId: unknown,
  rawQuery: unknown = {},
  now?: Date,
) {
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const parsed = querySchema.safeParse(rawQuery);
  if (!parsed.success) notFound();
  const query = parsed.data;
  // Session access makes this request-bound before reading the current time.
  const data = await readBills(access.workspaceId, now ?? new Date());
  if (query.account && !data.accounts.some((a) => a.id === query.account))
    notFound();
  const selected = query.accountId
    ? data.bills.find(
        (b) =>
          b.payment.accountId === query.accountId &&
          b.payment.merchant === query.merchant,
      )
    : undefined;
  if (query.accountId && !selected) notFound();
  const cycle = selected
    ? query.cycle
      ? selected.cycles.find((c) => c.scheduledOn === query.cycle)
      : (selected.cycles.find((c) => !isSettled(c)) ?? selected.cycles.at(-1))
    : undefined;
  if (query.cycle && !cycle) notFound();
  const canEdit = roleAtLeast(access.role, "editor");
  const candidates =
    canEdit &&
    selected &&
    cycle &&
    selected.payment.decision === "confirmed" &&
    selected.payment.kind === "bill"
      ? await paymentCandidates(
          access.workspaceId,
          selected,
          cycle,
          data.today,
          query.paymentPage,
        )
      : { rows: [], hasMore: false };
  const accounts = query.account
    ? data.accounts.filter((a) => a.id === query.account)
    : data.accounts;
  const active = data.bills.filter(
    (b) => b.payment.kind === "bill" && b.payment.decision === "confirmed",
  );
  const cash = coverage(
    accounts,
    active.flatMap((b) =>
      b.cycles.map((c) => ({ accountId: b.payment.accountId, cycle: c })),
    ),
    data.today,
  );
  return {
    ...data,
    workspaceId: access.workspaceId,
    query,
    selected: selected ?? null,
    cycle: cycle ?? null,
    candidates,
    canEdit,
    cash,
  };
}
export type BillsView = Awaited<ReturnType<typeof loadBills>>;
