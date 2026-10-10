/**
 * The links in the signed-in header, in order. Each href has a page in
 * `src/app/(app)/`. To add a page: create its folder there and add one line
 * here.
 */
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/accounts", label: "Accounts" },
  { href: "/transactions", label: "Transactions" },
  { href: "/import", label: "Import" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/bills", label: "Bills" },
  { href: "/budgets", label: "Budgets" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
