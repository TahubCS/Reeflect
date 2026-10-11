import { afterEach, describe, expect, it, vi } from "vitest";

// Google's SDK is replaced, so no test ever calls Google.
const create = vi.hoisted(() => vi.fn());
const constructed = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create };
    constructor(options: unknown) {
      constructed(options);
    }
  },
}));

const { googleTransport } = await import("./google");
const { AiUnavailableError, generateText } = await import("./client");

afterEach(() => {
  vi.clearAllMocks();
});

const call = {
  model: "gemini-test",
  system: "be brief",
  user: "hello",
  timeoutMs: 4_000,
};

describe("googleTransport", () => {
  it("sends one stateless request and returns the text", async () => {
    create.mockResolvedValue({ status: "completed", output_text: "Hi there." });

    const text = await googleTransport("key-for-tests")(call);

    expect(text).toBe("Hi there.");
    expect(constructed).toHaveBeenCalledWith({ apiKey: "key-for-tests" });
    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({
      model: "gemini-test",
      input: "hello",
      system_instruction: "be brief",
      // Nothing is kept at Google (ADR-059).
      store: false,
    });
    // The chain moves on to the next model; the SDK must not retry itself.
    expect(options).toEqual({ timeout: 4_000, maxRetries: 0 });
  });

  it("returns an empty string when the model produced no text", async () => {
    create.mockResolvedValue({ status: "completed" });

    expect(await googleTransport("key-for-tests")(call)).toBe("");
  });

  it("fails when the reply was cut short or did not finish", async () => {
    for (const status of ["incomplete", "failed", undefined]) {
      create.mockResolvedValue({ status, output_text: "Your top spending" });

      await expect(googleTransport("key-for-tests")(call)).rejects.toThrow(
        /interaction/,
      );
    }
  });

  it("lets the SDK's error through with its status", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("quota"), { status: 429 }),
    );

    await expect(googleTransport("key-for-tests")(call)).rejects.toMatchObject({
      status: 429,
    });
  });
});

describe("generateText without a key", () => {
  it("reports unavailable and never calls Google", async () => {
    // vitest.config.mts sets no GEMINI_API_KEY.
    await expect(
      generateText({ system: "be brief", user: "hello" }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("a request with a picture (ADR-067)", () => {
  const image = { mimeType: "image/png", data: "aGVsbG8=" };
  const schema = { type: "object", properties: { total: { type: "string" } } };

  it("sends the picture inline beside the words, and still keeps nothing", async () => {
    create.mockResolvedValue({ status: "completed", output_text: "{}" });

    await googleTransport("key-for-tests")({ ...call, image, schema });

    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({
      model: "gemini-test",
      input: [
        { type: "text", text: "hello" },
        { type: "image", data: "aGVsbG8=", mime_type: "image/png" },
      ],
      system_instruction: "be brief",
      // The answer must be JSON in the shape asked for.
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema,
      },
      store: false,
    });
    expect(options).toEqual({ timeout: 4_000, maxRetries: 0 });
  });

  it("asks for no format when no shape is given, as before", async () => {
    create.mockResolvedValue({ status: "completed", output_text: "Hi." });

    await googleTransport("key-for-tests")(call);

    const [params] = create.mock.calls[0]!;
    expect(params.input).toBe("hello");
    expect(params).not.toHaveProperty("response_format");
  });

  it("reports unavailable without a key and never calls Google", async () => {
    const { generateFromImage } = await import("./client");

    await expect(
      generateFromImage({ system: "read it", user: "Categories:", image }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });
});
