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
export type NavSegment = NavItem["segment"];

/**
 * Sent on `window` after something changes the header's counts or sync
 * time (a sync, a confirmed pattern), so the header reads them again.
 */
export const NAV_REFRESH_EVENT = "reeflect:nav-refresh";

/** The number on a link: at most two digits, so the bar keeps its width. */
export const navCountText = (count: number) =>
  count > 99 ? "99+" : String(count);

/** What a link's number means, read after the label by screen readers. */
export function navCountLabel(segment: NavSegment, count: number): string {
  if (segment === "subscriptions")
    return `${count} suggested ${count === 1 ? "pattern" : "patterns"} to review`;
  return `${count} to review`;
}

/** A nav link's URL: inside `workspaceId` when known, else the redirect. */
export function navHref(segment: string, workspaceId?: string): string {
  return workspaceId ? `/w/${workspaceId}/${segment}` : `/${segment}`;
}
