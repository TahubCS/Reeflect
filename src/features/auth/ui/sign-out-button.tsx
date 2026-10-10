"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import styles from "./auth.module.css";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const signOut = async () => {
    setPending(true);
    const { error } = await authClient.signOut();
    if (error) {
      // Still signed in: let the person try again.
      setPending(false);
      return;
    }
    router.push("/");
  };

  return (
    <button
      type="button"
      className={styles.signOut}
      disabled={pending}
      onClick={signOut}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
