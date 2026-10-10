import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <PagePlaceholder
      title="Insights"
      purpose="A plain-language summary of where you stand, written from your own numbers."
      features="F-15"
    />
  );
}
