import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <PagePlaceholder
      title="Transactions"
      purpose="Every transaction across your accounts, with its category, and a way to add or correct one by hand."
      features="F-04 and F-08"
    />
  );
}
