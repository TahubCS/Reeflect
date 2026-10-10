import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Budgets" };

export default function BudgetsPage() {
  return (
    <PagePlaceholder
      title="Budgets"
      purpose="A monthly budget for each category and how much of it is left."
      features="F-09"
    />
  );
}
