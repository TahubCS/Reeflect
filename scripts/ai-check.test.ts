import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@/lib/ai/chain";

// The script's `main` only runs when it is the entry point, and Google's
// SDK is replaced, so importing it here calls nothing.
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));
const { checkModel, formatChecks } = await import("./ai-check");

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
