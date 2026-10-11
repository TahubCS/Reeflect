import type { Metadata } from "next";
import { Suspense } from "react";
import { PageLoading } from "@/components/ui/page-loading";
import {
  RecurringPage,
  confirmPaymentAction,
  listRecurringPayments,
  paymentDispositionAction,
  paymentIntentAction,
  querySchema,
  refreshPaymentsAction,
  savePaymentAction,
  updatePaymentAction,
} from "@/features/recurring";
import { requireWorkspaceAccess } from "@/lib/auth/authz";
import { getSession } from "@/lib/auth/session";
import { roleAtLeast } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Recurring payments" };

type Props = PageProps<"/w/[workspaceId]/subscriptions">;
async function Payments({ params, searchParams }: Props) {
  const { workspaceId } = await params;
  const access = await requireWorkspaceAccess(
    await getSession(),
    workspaceId,
    "viewer",
  );
  const [data, requested] = await Promise.all([
    listRecurringPayments(access.workspaceId),
    searchParams,
  ]);
  const query = querySchema.parse(requested);
  const filtered = data.payments.filter(
    (payment) =>
      (query.kind === "all" || payment.kind === query.kind) &&
      (query.state === "all"
        ? payment.decision !== "dismissed"
        : payment.decision === query.state) &&
      (query.intent === "all" || payment.userIntent === query.intent) &&
      (!query.account || payment.accountId === query.account),
  );
  const pageSize = 20;
  const cards = filtered
    .slice((query.page - 1) * pageSize, query.page * pageSize)
    .map((payment) => ({
      ...payment,
      accountName: data.accounts.find(
        (account) => account.id === payment.accountId,
      )!.name,
      actions: {
        confirm: confirmPaymentAction.bind(
          null,
          access.workspaceId,
          payment.accountId,
          payment.merchant,
        ),
        intent: paymentIntentAction.bind(
          null,
          access.workspaceId,
          payment.accountId,
          payment.merchant,
        ),
        disposition: paymentDispositionAction.bind(
          null,
          access.workspaceId,
          payment.accountId,
          payment.merchant,
        ),
        update: updatePaymentAction.bind(
          null,
          access.workspaceId,
          payment.accountId,
          payment.merchant,
        ),
      },
    }));
  return (
    <RecurringPage
      cards={cards}
      accounts={data.accounts}
      accountsHref={`/w/${access.workspaceId}/accounts`}
      today={data.today}
      canEdit={roleAtLeast(access.role, "editor")}
      summary={data.summary}
      createAction={savePaymentAction.bind(null, access.workspaceId)}
      refreshAction={refreshPaymentsAction.bind(null, access.workspaceId)}
      query={query}
      total={filtered.length}
      pageSize={pageSize}
    />
  );
}
export default function SubscriptionsPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Payments {...props} />
    </Suspense>
  );
}
