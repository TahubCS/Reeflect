import { describe, expect, it, vi } from "vitest";
import {
  AiUnavailableError,
  FAILURE_COOL_OFF_MS,
  type Transport,
  UNKNOWN_MODEL_COOL_OFF_MS,
  createChain,
} from "./chain";
import { MAX_MODELS, TEST_MODELS, USER_MODELS, parseModels } from "./models";

const request = { system: "be brief", user: "hello" };

/** An API error as Google's SDK throws it: an Error with a status. */
function apiError(status: number): Error {
  return Object.assign(new Error(`status ${status}`), { status });
}

/** A transport scripted per model: text to return, or an error to throw. */
function scripted(script: Record<string, string | Error>) {
  return vi.fn<Transport>(async ({ model }) => {
    const step = script[model];
    if (step === undefined) throw new Error(`unexpected model ${model}`);
    if (step instanceof Error) throw step;
    return step;
  });
}

describe("createChain", () => {
  it("answers from the first model and asks no other", async () => {
    const transport = scripted({ a: "Hi there." });
    const generate = createChain({ transport, models: ["a", "b"] });

    await expect(generate(request)).resolves.toMatchObject({
      text: "Hi there.",
      model: "a",
    });
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0]![0]).toMatchObject({
      ...request,
      model: "a",
    });
  });

  it("falls to the next model on a quota error, a server error, a timeout or an unknown model", async () => {
    for (const failure of [
      apiError(429),
      apiError(500),
      apiError(404),
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    ]) {
      const generate = createChain({
        transport: scripted({ a: failure, b: "From b." }),
        models: ["a", "b"],
      });

      await expect(generate(request)).resolves.toMatchObject({
        text: "From b.",
        model: "b",
      });
    }
  });

  it("treats an empty or blank answer as a failure", async () => {
    const generate = createChain({
      transport: scripted({ a: "   ", b: " From b. " }),
      models: ["a", "b"],
    });

    const result = await generate(request);

    expect(result.text).toBe("From b.");
    expect(result.attempts).toEqual([
      { model: "a", outcome: "empty" },
      { model: "b", outcome: "answered" },
    ]);
  });

  it("reports every attempt when no model answers", async () => {
    const generate = createChain({
      transport: scripted({ a: apiError(429), b: apiError(503) }),
      models: ["a", "b"],
    });

    const failure = await generate(request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiUnavailableError);
    expect((failure as AiUnavailableError).attempts).toEqual([
      { model: "a", outcome: "failed", status: 429 },
      { model: "b", outcome: "failed", status: 503 },
    ]);
  });

  it("leaves a failed model alone until it has cooled off", async () => {
    let clock = 1_000_000;
    const transport = scripted({ a: apiError(429), b: "From b." });
    const generate = createChain({
      transport,
      models: ["a", "b"],
      now: () => clock,
    });

    await generate(request);
    const second = await generate(request);

    expect(second.attempts[0]).toEqual({ model: "a", outcome: "cooling_off" });
    expect(transport.mock.calls.map(([call]) => call.model)).toEqual([
      "a",
      "b",
      "b",
    ]);

    clock += FAILURE_COOL_OFF_MS + 1;
    await generate(request);
    expect(transport.mock.calls.at(-2)![0].model).toBe("a");
  });

  it("leaves an unknown model alone for much longer", async () => {
    let clock = 0;
    const transport = scripted({ a: apiError(404), b: "From b." });
    const generate = createChain({
      transport,
      models: ["a", "b"],
      now: () => clock,
    });

    await generate(request);
    clock += FAILURE_COOL_OFF_MS + 1;
    const later = await generate(request);
    expect(later.attempts[0]!.outcome).toBe("cooling_off");

    clock += UNKNOWN_MODEL_COOL_OFF_MS;
    const muchLater = await generate(request);
    expect(muchLater.attempts[0]).toMatchObject({
      model: "a",
      outcome: "failed",
    });
  });

  it("cools a model off after an overload or a timeout too", async () => {
    for (const failure of [
      apiError(503),
      Object.assign(new Error("timed out"), { name: "TimeoutError" }),
    ]) {
      const transport = scripted({ a: failure, b: "From b." });
      const generate = createChain({ transport, models: ["a", "b"] });

      await generate(request);
      const second = await generate(request);

      expect(second.attempts[0]).toEqual({
        model: "a",
        outcome: "cooling_off",
      });
      expect(
        transport.mock.calls.filter(([call]) => call.model === "a"),
      ).toHaveLength(1);
    }
  });

  it("gives each attempt at most the time that is left, and stops when none is", async () => {
    let clock = 0;
    const transport = vi.fn<Transport>(async ({ model }) => {
      clock += 5_000; // every call takes five seconds
      if (model === "c") return "From c.";
      throw apiError(500);
    });
    const generate = createChain({
      transport,
      models: ["a", "b", "c", "d"],
      attemptTimeoutMs: 6_000,
      totalBudgetMs: 12_000,
      now: () => clock,
    });

    const result = await generate(request);

    expect(result.model).toBe("c");
    expect(transport.mock.calls.map(([call]) => call.timeoutMs)).toEqual([
      6_000, 6_000, 2_000,
    ]);

    // With a slower third model there is no time left for a fourth.
    clock = 0;
    const slow = createChain({
      transport: vi.fn<Transport>(async () => {
        clock += 5_000;
        throw apiError(500);
      }),
      models: ["a", "b", "c", "d"],
      totalBudgetMs: 12_000,
      now: () => clock,
    });
    const failure = (await slow(request).catch(
      (error: unknown) => error,
    )) as AiUnavailableError;
    expect(failure.attempts.at(-1)).toEqual({
      model: "d",
      outcome: "out_of_time",
    });
  });
});

describe("parseModels", () => {
  it("gives the deployed app the users' models and everything else the test model", () => {
    for (const unset of [undefined, "", " , "]) {
      expect(parseModels(unset, true)).toEqual([...USER_MODELS]);
      expect(parseModels(unset, false)).toEqual([...TEST_MODELS]);
    }
  });

  it("keeps testing off every model that answers users", () => {
    expect(TEST_MODELS.length).toBeGreaterThan(0);
    expect(TEST_MODELS.filter((model) => USER_MODELS.includes(model))).toEqual(
      [],
    );
    expect(USER_MODELS.length).toBeLessThanOrEqual(MAX_MODELS);
  });

  it("lets GEMINI_MODELS replace either chain, trimming and dropping repeats", () => {
    expect(parseModels(" a , b,a ,, c ", true)).toEqual(["a", "b", "c"]);
    expect(parseModels(" a , b,a ,, c ", false)).toEqual(["a", "b", "c"]);
  });

  it("never returns more than six models", () => {
    expect(parseModels("a,b,c,d,e,f,g,h", true)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });
});
