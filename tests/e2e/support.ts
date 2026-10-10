import type { Page } from "@playwright/test";

/** Session saved by auth.setup.ts. Use with `test.use({ storageState })`. */
export const SIGNED_IN_STATE = "test-results/.auth/user.json";

/**
 * Waits until React has attached its event handlers to the element, so a
 * click or key press right after page load is not lost.
 */
export async function hydrated(page: Page, selector: string): Promise<void> {
  await page.waitForFunction((target) => {
    const element = document.querySelector(target);
    return (
      element !== null &&
      Object.keys(element).some((key) => key.startsWith("__reactProps"))
    );
  }, selector);
}

/**
 * A header that makes a test look like its own client. Better Auth rate-limits
 * sign-up and sign-in per IP address, and every test would otherwise share
 * one address and one allowance.
 */
export function ownClientAddress(): Record<string, string> {
  const part = (): number => 1 + Math.floor(Math.random() * 254);
  return { "x-forwarded-for": `10.${part()}.${part()}.${part()}` };
}
