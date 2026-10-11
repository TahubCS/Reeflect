import { describe, expect, it } from "vitest";
import {
  billHref,
  formValues,
  parseBillForm,
  parseInvoiceForm,
  paymentInputSchemaForBills,
  querySchema,
  rejected,
} from "./forms";
const accountId = crypto.randomUUID();
const form = (extra: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    accountId,
    name: "Electric",
    merchant: "ELECTRIC 1234",
    amount: "145.01",
    every: "1",
    unit: "months",
    nextOn: "2026-10-31",
    amountMode: "variable",
    ...extra,
  }))
    data.set(key, value);
  return data;
};
describe("bill form boundaries", () => {
  it("normalizes the payee and parses cents without retaining untrusted fields", () => {
    const parsed = parseBillForm(
      form({
        merchant: "",
        autopay: "on",
        useHistory: "on",
        liabilityAccountId: accountId,
        invoiceAmount: "184.05",
        workspaceId: "forged",
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success)
      expect(parsed.data).toMatchObject({
        merchant: "electric",
        amountCents: 14501,
        invoiceCents: 18405,
        autopay: true,
        useHistory: true,
        liabilityAccountId: accountId,
        kind: "bill",
      });
    expect(formValues(form({ workspaceId: "forged" }))).not.toHaveProperty(
      "workspaceId",
    );
    expect(parseBillForm(form({ name: "", merchant: "" })).success).toBe(false);
    expect(parseBillForm(new FormData()).success).toBe(false);
  });
  it.each(["", "0", "124.32"])(
    "distinguishes optional invoice %s from a typical estimate",
    (invoiceAmount) => {
      const parsed = parseInvoiceForm(
        form({ invoiceAmount, dueOn: "2026-10-31" }),
      );
      expect(parsed.success).toBe(true);
      if (parsed.success)
        expect(parsed.data.invoiceCents).toBe(
          invoiceAmount === "" ? null : invoiceAmount === "0" ? 0 : 12432,
        );
    },
  );
  it.each(["-1", "garbage", "2.345", "100000001"])(
    "rejects invoice amount %s and keeps input with an accessible field error",
    (invoiceAmount) => {
      const data = form({ invoiceAmount, dueOn: "2026-02-30" });
      const parsed = parseInvoiceForm(data);
      expect(parsed.success).toBe(false);
      if (!parsed.success)
        expect(rejected(parsed.error, data)).toMatchObject({
          values: { invoiceAmount },
          errors: {
            dueOn: expect.any(String),
            invoiceAmount: expect.any(String),
          },
        });
    },
  );
  it("rejects invalid typical amounts/cadence and bounds echoed values and files", () => {
    const data = form({ amount: "bad", every: "37", name: "x".repeat(3000) });
    data.set("merchant", new Blob(["private"]));
    expect(formValues(data).merchant).toBe("");
    expect(formValues(data).name).toHaveLength(2000);
    const parsed = parseBillForm(data);
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(rejected(parsed.error, data).errors.amount).toBeDefined();
    expect(parseBillForm(form({ every: "37" })).success).toBe(false);
  });
  it("requires explicit payment confirmation", () => {
    expect(
      paymentInputSchemaForBills.safeParse({ transactionId: accountId })
        .success,
    ).toBe(false);
    expect(
      paymentInputSchemaForBills.safeParse({
        transactionId: accountId,
        confirmed: "on",
      }).success,
    ).toBe(true);
  });
  it("validates paired targets and dates, bounds pagination and safely encodes bill links", () => {
    expect(
      querySchema.parse({
        view: "bad",
        page: -1,
        paymentPage: "bad",
        account: "bad",
      }),
    ).toMatchObject({
      view: "upcoming",
      page: 1,
      paymentPage: 1,
      historyPage: 1,
      account: undefined,
    });
    expect(querySchema.safeParse({ accountId }).success).toBe(false);
    expect(querySchema.safeParse({ merchant: "Electric" }).success).toBe(false);
    expect(
      querySchema.safeParse({ from: "2026-10-02", to: "2026-10-01" }).success,
    ).toBe(false);
    expect(querySchema.safeParse({ from: "", to: "" }).success).toBe(true);
    expect(querySchema.safeParse({ from: "2026-10-01" }).success).toBe(true);
    const href = billHref(
      "workspace",
      accountId,
      "rent & utilities",
      "2026-10-31",
    );
    expect(new URL(href, "http://localhost").searchParams.get("merchant")).toBe(
      "rent & utilities",
    );
    expect(billHref("workspace", accountId, "rent")).not.toContain("cycle=");
  });
});
