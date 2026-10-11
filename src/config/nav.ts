/**
 * The links in the signed-in header, in order. Each segment is a page in
 * `src/app/(app)/w/[workspaceId]/`, linked inside the current workspace,
 * plus a redirect at `src/app/(app)/<segment>/` for the workspace-free URL.
 * To add a page: create both folders and add one line here.
 */
export const NAV_ITEMS = [
  { segment: "dashboard", label: "Dashboard" },
  { segment: "accounts", label: "Accounts" },
  { segment: "transactions", label: "Transactions" },
  { segment: "import", label: "Import" },
  { segment: "subscriptions", label: "Recurring payments" },
  { segment: "bills", label: "Bills" },
  { segment: "budgets", label: "Budgets" },
  { segment: "insights", label: "Insights" },
  { segment: "settings", label: "Settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];

/** A nav link's URL: inside `workspaceId` when known, else the redirect. */
export function navHref(segment: string, workspaceId?: string): string {
  return workspaceId ? `/w/${workspaceId}/${segment}` : `/${segment}`;
}
