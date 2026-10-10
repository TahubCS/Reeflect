import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <PagePlaceholder
      title="Accounts"
      purpose="Your checking, savings and card accounts in one place, including the Capital One sandbox connection."
      features="F-03 and F-23"
    />
  );
}
