import type { Metadata } from "next";
import { Suspense } from "react";
import { MessagesSection } from "@/features/messaging/ui/messages-section";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

type Params = PageProps<"/w/[workspaceId]/settings">["params"];

/** Reads the URL and the session, so it renders inside the boundary below. */
async function Messages({ params }: { params: Params }) {
  const { workspaceId } = await params;
  return <MessagesSection workspaceId={workspaceId} />;
}

// The heading shows at once on a click from another page; the card streams
// in behind its own Suspense boundary.
export default function SettingsPage({
  params,
}: PageProps<"/w/[workspaceId]/settings">) {
  return (
    <main className={styles.page}>
      <h1>Settings</h1>
      <Suspense fallback={<p className={styles.note}>Loading…</p>}>
        <Messages params={params} />
      </Suspense>
      <p className={styles.note}>Not built yet: deleting your data (F-19).</p>
    </main>
  );
}
