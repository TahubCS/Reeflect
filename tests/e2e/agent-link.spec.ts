import {
  type APIRequestContext,
  type Browser,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { hydrated, signUpVerified } from "./support";

// F-24 phone linking (ADR-034, ADR-051). There is no worker in these tests:
// the phone's texts are posted to /api/agent/turn as the worker would send
// them, with the service token from playwright.config.ts.

const SERVICE_TOKEN = "e2e-only-agent-service-token-0123456789";

/** Signs a new user up and verifies them, then opens their Settings page. */
async function openSettings(
  browser: Browser,
  baseURL: string | undefined,
): Promise<Page> {
  const context = await browser.newContext();
  await signUpVerified(context.request, baseURL, {
    name: "Link Tester",
    email: `e2e-link-${crypto.randomUUID()}@example.test`,
  });

  const page = await context.newPage();
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/w\/[^/]+\/settings$/);
  await hydrated(page, "main button");
  return page;
}

function newPhone(): string {
  return `+1${String(Math.floor(Math.random() * 1e10)).padStart(10, "0")}`;
}

/** Sends one text from `handle` and returns the agent's reply. */
async function text(
  request: APIRequestContext,
  handle: string,
  message: string,
): Promise<string> {
  const response = await request.post("/api/agent/turn", {
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
}

/** Presses Connect and reads the instruction the card shows, "LINK 482 193". */
async function getInstruction(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Connect iMessage" }).click();
  const instruction = page.getByText(/^LINK \d{3} \d{3}$/);
  await expect(instruction).toBeVisible();
  return (await instruction.textContent())!;
}

async function linkPhone(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  const handle = newPhone();
  await text(request, handle, await getInstruction(page));
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(
    page.getByText(`Connected: phone ending ${handle.slice(-4)}`),
  ).toBeVisible();
  return handle;
}

test("a phone links only after the website approves it", async ({
  browser,
  baseURL,
  request,
}) => {
  const page = await openSettings(browser, baseURL);
  const handle = newPhone();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  const instruction = await getInstruction(page);
  await expect(page.getByText("Valid until")).toBeVisible();

  expect(await text(request, handle, instruction)).toContain("press Approve");
  // Texting the code alone gives the phone nothing.
  expect(await text(request, handle, "how am I doing?")).toContain(
    "sign in on the website",
  );

  // The card notices the request by itself.
  await expect(
    page.getByText(`Link request from phone ending ${handle.slice(-4)}`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();

  await expect(
    page.getByText(`Connected: phone ending ${handle.slice(-4)}`),
  ).toBeVisible();
  expect(await text(request, handle, "how am I doing?")).toContain(
    "no accounts for you yet",
  );
});

test("Not me refuses the phone", async ({ browser, baseURL, request }) => {
  const page = await openSettings(browser, baseURL);
  const handle = newPhone();
  await text(request, handle, await getInstruction(page));

  await page.getByRole("button", { name: "Not me" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Request refused. Nothing was linked.",
  );
  await expect(
    page.getByRole("button", { name: "Connect iMessage" }),
  ).toBeVisible();
  expect(await text(request, handle, "hello")).toContain(
    "sign in on the website",
  );
});

test("a wrong code links nothing", async ({ browser, baseURL, request }) => {
  const page = await openSettings(browser, baseURL);
  const instruction = await getInstruction(page);
  const wrong = instruction.endsWith("0") ? "1" : "0";

  expect(
    await text(request, newPhone(), instruction.slice(0, -1) + wrong),
  ).toContain("didn't work");

  await expect(page.getByText(instruction)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});

test("the opt-in is off until chosen, and Disconnect unlinks", async ({
  browser,
  baseURL,
  request,
}) => {
  const page = await openSettings(browser, baseURL);
  const handle = await linkPhone(page, request);

  const optIn = page.getByRole("checkbox", {
    name: "Text me about new subscriptions and bills",
  });
  await expect(optIn).not.toBeChecked();
  await optIn.check();
  // The box is disabled while the choice is being saved.
  await expect(optIn).toBeEnabled();
  await page.reload();
  await expect(optIn).toBeChecked();

  await hydrated(page, "main button");
  await page.getByRole("button", { name: "Disconnect" }).click();

  await expect(
    page.getByRole("button", { name: "Connect iMessage" }),
  ).toBeVisible();
  expect(await text(request, handle, "hello")).toContain(
    "sign in on the website",
  );
});

test("STOP from the phone unlinks it", async ({
  browser,
  baseURL,
  request,
}) => {
  const page = await openSettings(browser, baseURL);
  const handle = await linkPhone(page, request);

  expect(await text(request, handle, "STOP")).toContain("unlinked");

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Connect iMessage" }),
  ).toBeVisible();
});

test("a reload hides the code", async ({ browser, baseURL }) => {
  const page = await openSettings(browser, baseURL);
  const instruction = await getInstruction(page);

  await page.reload();

  await expect(page.getByText("Your code is hidden for safety.")).toBeVisible();
  await expect(page.getByText(instruction)).toHaveCount(0);
});

test("the code fits a 360px phone without sideways scrolling", async ({
  browser,
  baseURL,
}) => {
  const page = await openSettings(browser, baseURL);
  await page.setViewportSize({ width: 360, height: 740 });
  await getInstruction(page);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the turn endpoint does not exist for callers without the token", async ({
  request,
}) => {
  const turn = {
    platform: "imessage",
    handle: newPhone(),
    spaceId: "space",
    messageId: "e2e",
    text: "how am I doing?",
  };

  for (const headers of [
    undefined,
    { authorization: "Bearer wrong-token" },
    { authorization: SERVICE_TOKEN },
  ]) {
    const response = await request.post("/api/agent/turn", {
      data: turn,
      headers,
    });
    expect(response.status()).toBe(404);
  }
});
