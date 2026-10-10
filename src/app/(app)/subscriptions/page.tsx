import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Subscriptions" };

export default function SubscriptionsPage() {
  return (
    <PagePlaceholder
      title="Subscriptions"
      purpose="The recurring charges we found, what each costs in a month and a year, and which ones you plan to cancel."
      features="F-10"
    />
  );
}
