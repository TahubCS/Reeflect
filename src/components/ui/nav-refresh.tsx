"use client";

import { useEffect, useRef } from "react";
import { NAV_REFRESH_EVENT } from "@/config/nav";

/**
 * Tells the header to read its counts again when `token` changes: a page
 * renders this with the number behind a link's count, so a change made on
 * the page (a confirmed pattern) shows in the header too. Renders nothing.
 */
export function NavRefresh({ token }: { token: string | number }) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.dispatchEvent(new Event(NAV_REFRESH_EVENT));
  }, [token]);
  return null;
}
