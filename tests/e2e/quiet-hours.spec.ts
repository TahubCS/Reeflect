import { type Browser, type Page, expect, test } from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-33 (ADR-038, ADR-104): quiet hours are set on Settings → Notifications
// or by text, and a text change can be undone. Texts are posted to
// /api/agent/turn as the worker would send them.

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";

async function newUserPage(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Quiet Tester",
    email: `e2e-quiet-${crypto.randomUUID()}@example.test`,
  });
  return context.newPage();
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  await hydrated(page, "main form button");
}

const notifications = (page: Page) =>
  page.getByRole("region", { name: "Notifications" });

test("quiet hours are set on the website and kept", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await openSettings(page);
  const card = notifications(page);

  await expect(
    card.getByText("9:00 PM to 9:00 AM", { exact: true }),
  ).toBeVisible();

  // The same time twice is refused, in words.
  await card.getByLabel("Start").fill("09:00");
  await card.getByLabel("End").fill("09:00");
  await card.getByRole("button", { name: "Save quiet hours" }).click();
  await expect(card.getByRole("status")).toHaveText(
    "Start and end must be different times.",
  );

  await card.getByLabel("Start").fill("23:00");
  await card.getByLabel("End").fill("07:00");
  await card.getByRole("button", { name: "Save quiet hours" }).click();
  await expect(card.getByRole("status")).toHaveText("Quiet hours saved.");

  await openSettings(page);
  await expect(
    notifications(page).getByText("11:00 PM to 7:00 AM", { exact: true }),
  ).toBeVisible();
  await expect(notifications(page).getByLabel("Start")).toHaveValue("23:00");
});

test("quiet hours are set by text, and UNDO puts them back", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  const handle = `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
  const text = async (message: string): Promise<string> => {
    const response = await page.request.post("/api/agent/turn", {
      headers: { authorization: `Bearer ${SERVICE_TOKEN}` },
      data: {
        platform: "imessage",
        handle,
        spaceId: `any;-;${handle}`,
        messageId: crypto.randomUUID(),
        text: message,
      },
    });
    expect(response.status()).toBe(200);
    return ((await response.json()) as { reply: string }).reply;
  };

  await openSettings(page);
  await page.getByRole("button", { name: "Connect iMessage" }).click();
  const instruction = page.getByText(/^LINK \d{3} \d{3}$/);
  await expect(instruction).toBeVisible();
  await text((await instruction.textContent())!);
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/^Connected: phone ending/)).toBeVisible();

  expect(await text("quiet hours 10pm to 6:30am")).toBe(
    "Quiet hours set: 10:00 PM to 6:30 AM. Reply UNDO to go back.",
  );
  expect(await text("quiet hours 10 to 6")).toContain(
    "I couldn't read those times.",
  );

  await openSettings(page);
  await expect(
    notifications(page).getByText("10:00 PM to 6:30 AM", { exact: true }),
  ).toBeVisible();

  expect(await text("UNDO")).toBe(
    "Done. Quiet hours are back to 9:00 PM to 9:00 AM.",
  );
  await openSettings(page);
  await expect(
    notifications(page).getByText("9:00 PM to 9:00 AM", { exact: true }),
  ).toBeVisible();
});
