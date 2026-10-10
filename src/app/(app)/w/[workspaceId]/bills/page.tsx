import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return (
    <PagePlaceholder
      title="Bills"
      purpose="The bills coming up, when each is due, and whether your balance covers it."
      features="F-22"
    />
  );
}
