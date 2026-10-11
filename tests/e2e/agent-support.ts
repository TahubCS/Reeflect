import { type Browser, type Page, expect } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// Shared by the specs where a linked phone texts the agent (F-27, F-29).
// The phone's messages are posted to /api/agent/turn as the worker would
// send them, with the service token from playwright.config.ts. No model is
// called under test (ADR-059).

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";

/** What a turn may carry besides its words: a picture, or why there is none. */
export type Photo =
  | { status: "attached"; mimeType: string; data: string }
  | { status: "too_large" | "unsupported" | "several" | "unavailable" };

export async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Log Tester",
    email: `e2e-log-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

export async function addAccount(
  page: Page,
  account: { type?: string; nickname: string; balance: string },
) {
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Add an account" }).click();
  await hydrated(page, "form select");
  if (account.type) {
    await page.getByLabel("Account type").selectOption({ label: account.type });
  }
  await page
    .getByRole("textbox", { name: "Bank or card issuer", exact: true })
    .fill("Capital One");
  await page
    .getByRole("textbox", { name: "Nickname", exact: true })
    .fill(account.nickname);
  await page
    .getByRole("textbox", { name: /Current balance|Amount owed/ })
    .fill(account.balance);
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/accounts$/);
}

/**
 * Links a new phone to the page's user and returns how to text from it.
 * The function also carries the phone's `handle`, and `photo` to send a
 * picture as the worker would forward it.
 */
export async function linkPhone(page: Page) {
  const handle = `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
  const send = async (message: string, photo?: Photo): Promise<string> => {
    const response = await page.request.post("/api/agent/turn", {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
      data: {
        platform: "imessage",
        handle,
        spaceId: `any;-;${handle}`,
        messageId: crypto.randomUUID(),
        text: message,
        ...(photo === undefined ? {} : { photo }),
      },
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { reply: string }).reply;
  };
  const text = (message: string) => send(message);

  await page.goto("/settings");
  await hydrated(page, "main button");
  await page.getByRole("button", { name: "Connect iMessage" }).click();
  const instruction = page.getByText(/^LINK \d{3} \d{3}$/);
  await expect(instruction).toBeVisible();
  await text((await instruction.textContent())!);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Connected: phone ending/)).toBeVisible();
  return Object.assign(text, {
    handle,
    photo: (photo: Photo, caption = "") => send(caption, photo),
  });
}

export async function openDashboard(page: Page) {
  await page.goto("/dashboard");
  await hydrated(page, "button[data-date]");
}

export const headline = (page: Page) => page.getByRole("heading", { level: 1 });
export const dayPanel = (page: Page) =>
  page.getByRole("complementary", { name: "Selected day" });
