import { expect, test } from "@playwright/test";
import {
  addAccount,
  dayPanel,
  headline,
  linkPhone,
  newUserPage,
  openDashboard,
} from "./agent-support";

// F-27 (ADR-064): spending logged by text shows on the calendar, and UNDO
// takes it back. The phone's texts are posted to /api/agent/turn as the
// worker would send them (tests/e2e/agent-support.ts). No model is called
// under test (ADR-059), so categories come from the rules.

test("a text logs spending onto the calendar, and UNDO takes it back", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  const text = await linkPhone(page);

  expect(await text("12 lunch")).toBe(
    'Logged $12.00 for "lunch" today, in Dining. Text UNDO to remove it.',
  );

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $488.00 today.");
  // The row says where it came from, in words.
  await expect(dayPanel(page).getByText("Dining, texted in")).toBeVisible();
  await expect(
    dayPanel(page).getByText("lunch", { exact: true }),
  ).toBeVisible();

  // Typos and a missing piece are asked about, and nothing is saved.
  expect(await text("spnt 5 on cofee")).toContain('Logged $5.00 for "cofee"');
  expect(await text("twelve bucks lunch")).toContain("in digits");
  expect(await text("12")).toContain("What was it for?");

  expect(await text("undo")).toBe('Removed $5.00 for "cofee".');
  expect(await text("UNDO")).toBe('Removed $12.00 for "lunch".');
  expect(await text("undo")).toContain("nothing to undo");

  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");
  await expect(dayPanel(page).getByText("texted in")).toHaveCount(0);
});

test("with two accounts the agent asks which, and the next text can answer", async ({
  browser,
  baseURL,
}) => {
  const page = await newUserPage(browser, baseURL);
  await addAccount(page, { nickname: "Everyday", balance: "500" });
  await addAccount(page, {
    type: "Credit card",
    nickname: "Quicksilver",
    balance: "30",
  });
  const text = await linkPhone(page);

  expect(await text("40 gas")).toBe(
    'Which account for $40.00 "gas"? Reply with its number or name: 1 Everyday, 2 Quicksilver. Nothing is logged yet.',
  );
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $500.00 today.");

  // The answer is the next text: a number, a name or the kind of account.
  expect(await text("2")).toContain(
    'Logged $40.00 for "gas" today on Quicksilver',
  );
  expect(await text("12 lunch")).toContain('Which account for $12.00 "lunch"?');
  expect(await text("it was from my checking account")).toContain(
    'Logged $12.00 for "lunch" today on Everyday',
  );
  // Naming the account in the first text needs no question.
  expect(await text("3 gum on card")).toContain(
    'Logged $3.00 for "gum" today on Quicksilver',
  );
  expect(await text("undo")).toBe('Removed $3.00 for "gum".');

  // The card purchase shows as spending without moving the balance; the
  // checking one moves it.
  await openDashboard(page);
  await expect(headline(page)).toHaveText("You have $488.00 today.");
  await expect(dayPanel(page).getByText(/on card · Quicksilver/)).toBeVisible();
});
