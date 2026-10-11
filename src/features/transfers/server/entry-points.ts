import "server-only";
import type { EntryPoint, EntryPointTarget } from "@/lib/auth/entry-point";
import type { RowState } from "../domain/review";
import { loadTransferReview } from "./load";
import { reviewTransferAction } from "./actions";
function expected(t: EntryPointTarget): RowState {
  return {
    id: t.transactionId,
    accountId: t.accountId,
    postedOn: "2026-01-10",
    amountCents: -500,
    description: "Isolation target",
    status: "posted",
    isTransfer: false,
    pairId: null,
    updatedAt: "2026-01-10T00:00:00Z",
  };
}
function call(t: EntryPointTarget, operation: "pair" | "detach" | "label") {
  const row = expected(t);
  const form = new FormData();
  form.set("confirm", "on");
  form.set(
    "review",
    JSON.stringify({
      operation,
      expected:
        operation === "pair"
          ? [
              row,
              {
                ...row,
                id: "00000000-0000-4000-8000-000000000001",
                accountId: "00000000-0000-4000-8000-000000000002",
                amountCents: 500,
              },
            ]
          : [{ ...row, pairId: operation === "detach" ? "matrix" : null }],
      ...(operation === "label" ? { transfer: true } : {}),
    }),
  );
  return reviewTransferAction(t.workspaceId, {}, form);
}
export const TRANSFER_ENTRY_POINTS: EntryPoint[] = [
  {
    name: "loadTransferReview",
    minimumRole: "viewer",
    call: ({ workspaceId }) => loadTransferReview(workspaceId),
  },
  {
    name: "loadTransferAccount",
    minimumRole: "viewer",
    call: ({ workspaceId, accountId }) =>
      loadTransferReview(workspaceId, { account: accountId }),
  },
  {
    name: "loadTransferSource",
    minimumRole: "viewer",
    call: ({ workspaceId, transactionId }) =>
      loadTransferReview(workspaceId, {
        from: "2026-01-01",
        to: "2026-01-31",
        source: transactionId,
        view: "all",
      }),
  },
  ...(["pair", "detach", "label"] as const).map((operation) => ({
    name: `reviewTransferAction:${operation}`,
    minimumRole: "editor" as const,
    call: (t: EntryPointTarget) => call(t, operation),
  })),
];
