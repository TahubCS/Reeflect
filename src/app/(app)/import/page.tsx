import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <PagePlaceholder
      title="Import"
      purpose="Upload a bank statement as a CSV or PDF, check the preview, and add it to an account."
      features="F-05 and F-06"
    />
  );
}
