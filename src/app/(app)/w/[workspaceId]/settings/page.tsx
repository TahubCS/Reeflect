import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/ui/page-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PagePlaceholder
      title="Settings"
      purpose="Link your phone, set quiet hours for messages, and delete your data."
      features="F-24, F-33 and F-19"
    />
  );
}
