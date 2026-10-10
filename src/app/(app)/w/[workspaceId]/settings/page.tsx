import type { Metadata } from "next";
import { MessagesSection } from "@/features/messaging/ui/messages-section";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

// The workspace layout above renders this inside a Suspense boundary, which
// `MessagesSection` needs to read the session.
export default async function SettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/settings">) {
  const { workspaceId } = await params;

  return (
    <main className={styles.page}>
      <h1>Settings</h1>
      <MessagesSection workspaceId={workspaceId} />
      <p className={styles.note}>
        Not built yet: quiet hours for messages and deleting your data (F-33 and
        F-19).
      </p>
    </main>
  );
}
