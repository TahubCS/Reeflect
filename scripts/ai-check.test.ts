import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@/lib/ai/chain";

// The script's `main` only runs when it is the entry point, and Google's
// SDK is replaced, so importing it here calls nothing.
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
const { checkModel, checkReceiptModel, formatChecks } =
  await import("./ai-check");

const answering =
  (draft: string): Transport =>
  async () =>
    draft;
const failing =
  (error: unknown): Transport =>
  async () => {
    throw error;
  };
const status = (code: number) =>
  Object.assign(new Error("api"), { status: code });

describe("checkModel", () => {
  it("says whether an answer followed the label rule", async () => {
    expect(await checkModel(answering("You have {cash_total}."), "m")).toEqual({
      model: "m",
      result: "answered, followed the label rule",
      ok: true,
    });
    for (const draft of ["You have $12.", "You have {money}."]) {
      expect(await checkModel(answering(draft), "m")).toMatchObject({
        result: "answered, but broke the label rule",
        ok: true,
      });
    }
  });

  it("names why a model did not answer", async () => {
    const cases: [Transport, string][] = [
      [answering("  "), "no text"],
      [failing(status(429)), "out of quota or rate-limited (429)"],
      [failing(status(404)), "no such model (404): remove it from the chain"],
      [failing(status(403)), "key not accepted (403)"],
      [failing(status(500)), "failed (500)"],
      [failing(new TypeError("network")), "failed (TypeError)"],
      [failing("odd"), "failed (unknown)"],
    ];
    for (const [transport, result] of cases) {
      expect(await checkModel(transport, "m")).toEqual({
        model: "m",
        result,
        ok: false,
      });
    }
  });
});

describe("checkReceiptModel", () => {
  const image = { mimeType: "image/png", data: "aGVsbG8=" };
  const read = (changes: Record<string, string> = {}) =>
    JSON.stringify({
      kind: "receipt",
      merchant: "Corner Market",
      total: "23.40",
      currency: "USD",
      category: "Groceries",
      ...changes,
    });
  // A clock that moves 250 ms each time it is read.
  const clock = () => {
    let now = 0;
    return () => (now += 250);
  };

  it("says a model read the printed total, and how long it took", async () => {
    const transport = vi.fn<Transport>(async () => read());

    expect(await checkReceiptModel(transport, "m", image, clock())).toEqual({
      model: "m",
      result: "read the total, category Groceries (250 ms)",
      ok: true,
    });
    // The picture and the shape asked for go with the request.
    expect(transport.mock.calls[0]![0]).toMatchObject({
      model: "m",
      image,
      schema: { type: "object" },
    });
  });

  it("fails a model that reads another total, declines, or errors", async () => {
    const cases: [Transport, string][] = [
      [
        answering(read({ total: "22.00", category: "none" })),
        "read a WRONG total, category none (250 ms)",
      ],
      [
        answering(read({ kind: "not_receipt" })),
        "answered, but not as a receipt: not_receipt (250 ms)",
      ],
      [
        answering("The total is 23.40"),
        "answered, but not as a receipt: unreadable (250 ms)",
      ],
      [failing(status(400)), "failed (400)"],
      [failing(status(429)), "out of quota or rate-limited (429)"],
    ];
    for (const [transport, result] of cases) {
      expect(await checkReceiptModel(transport, "m", image, clock())).toEqual({
        model: "m",
        result,
        ok: false,
      });
    }
  });
});

describe("formatChecks", () => {
  it("lines the models up and marks each one", () => {
    expect(
      formatChecks([
        { model: "gemini-a", result: "answered", ok: true },
        { model: "gemini-longer", result: "failed (500)", ok: false },
      ]),
    ).toEqual([
      "ok    gemini-a       answered",
      "FAIL  gemini-longer  failed (500)",
    ]);
  });
});
