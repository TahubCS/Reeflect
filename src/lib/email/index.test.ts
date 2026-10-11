import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_NAME } from "@/config/app";

const afterMock = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterMock }));
const deliverMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));
vi.mock("./send", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./send")>()),
  deliver: deliverMock,
}));

const MESSAGE = { to: "a@example.test", subject: "s", text: "t", html: "h" };

afterEach(() => {
  vi.clearAllMocks();
});

describe("senderConfig", () => {
  it("uses the outbox, with a local sender, when there is no key", async () => {
    const { senderConfig } = await import("./index");

    expect(
      senderConfig({ RESEND_API_KEY: undefined, EMAIL_FROM: undefined }),
    ).toEqual({
      kind: "outbox",
      dir: ".email-outbox",
      from: `${APP_NAME} <no-reply@localhost>`,
    });
  });

  it("uses Resend and the configured sender when the key is set", async () => {
    const { senderConfig } = await import("./index");
    const config = senderConfig({
      RESEND_API_KEY: "re_test",
      EMAIL_FROM: "Reeflect <no-reply@example.test>",
    });

    expect(config.kind).toBe("resend");
    expect(config.from).toBe("Reeflect <no-reply@example.test>");
  });
});

describe("sendAfterResponse", () => {
  it("schedules the send for after the response", async () => {
    const { sendAfterResponse } = await import("./index");

    sendAfterResponse(MESSAGE, "user-1");

    expect(deliverMock).not.toHaveBeenCalled();
    const task = afterMock.mock.calls[0]?.[0] as () => Promise<unknown>;
    await task();
    expect(deliverMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "outbox" }),
      MESSAGE,
      "user-1",
    );
  });

  it("sends straight away outside a request", async () => {
    afterMock.mockImplementationOnce(() => {
      throw new Error("`after` was called outside a request scope");
    });
    const { sendAfterResponse } = await import("./index");

    sendAfterResponse(MESSAGE, "user-1");

    expect(deliverMock).toHaveBeenCalledWith(
      expect.anything(),
      MESSAGE,
      "user-1",
    );
  });
});
