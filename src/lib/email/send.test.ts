import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "./messages";
import { type ResendLike, deliver } from "./send";

const MESSAGE: EmailMessage = {
  to: "sam@example.test",
  subject: "Confirm your email",
  text: "Confirm: https://x.test/verify?token=secret-token",
  html: "<p>Confirm</p>",
};
const FROM = "Reeflect <no-reply@example.test>";

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeResend(
  result: Awaited<ReturnType<ResendLike["emails"]["send"]>> | Error,
): ResendLike & { send: ReturnType<typeof vi.fn> } {
  const send = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  return { send, emails: { send } };
}

/** Everything logged, as one string, to check nothing secret leaked. */
function logged(): string {
  return JSON.stringify([...info.mock.calls, ...error.mock.calls]);
}

describe("deliver through Resend", () => {
  it("sends from the configured address and logs only ids", async () => {
    const client = fakeResend({ data: { id: "msg_1" }, error: null });

    const result = await deliver(
      { kind: "resend", client, from: FROM },
      MESSAGE,
      "user-1",
    );

    expect(result).toEqual({ ok: true, id: "msg_1" });
    expect(client.send).toHaveBeenCalledWith({ from: FROM, ...MESSAGE });
    expect(info).toHaveBeenCalledWith("email: sent", {
      userId: "user-1",
      messageId: "msg_1",
    });
    expect(logged()).not.toContain("secret-token");
    expect(logged()).not.toContain("sam@example.test");
  });

  it("reports Resend's error name without throwing", async () => {
    const client = fakeResend({
      data: null,
      error: { name: "validation_error" },
    });

    const result = await deliver(
      { kind: "resend", client, from: FROM },
      MESSAGE,
      "user-1",
    );

    expect(result).toEqual({ ok: false, reason: "validation_error" });
    expect(error).toHaveBeenCalledWith("email: not sent", {
      userId: "user-1",
      reason: "validation_error",
    });
  });

  it("treats a missing message id as a failure", async () => {
    const client = fakeResend({ data: null, error: null });

    expect(
      await deliver({ kind: "resend", client, from: FROM }, MESSAGE, "u"),
    ).toEqual({ ok: false, reason: "no message id" });
  });

  it("catches a thrown error and logs its name, not its message", async () => {
    const client = fakeResend(new TypeError("fetch failed: secret-token"));

    const result = await deliver(
      { kind: "resend", client, from: FROM },
      MESSAGE,
      "user-1",
    );

    expect(result).toEqual({ ok: false, reason: "TypeError" });
    expect(logged()).not.toContain("secret-token");
  });

  it("logs an unknown error when something other than an Error is thrown", async () => {
    const send = vi.fn(() => Promise.reject("boom"));

    expect(
      await deliver(
        { kind: "resend", client: { emails: { send } }, from: FROM },
        MESSAGE,
        "u",
      ),
    ).toEqual({ ok: false, reason: "unknown error" });
  });
});

describe("deliver to the outbox", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "outbox-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes one JSON file per email, creating the folder", async () => {
    const outbox = join(dir, "nested");

    const result = await deliver(
      { kind: "outbox", dir: outbox, from: FROM },
      MESSAGE,
      "user-1",
    );

    const files = await readdir(outbox);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^\d+-[0-9a-f-]+\.json$/);
    const saved: unknown = JSON.parse(
      await readFile(join(outbox, files[0] ?? ""), "utf8"),
    );
    expect(result.ok).toBe(true);
    expect(saved).toEqual({
      id: result.ok ? result.id : "",
      from: FROM,
      ...MESSAGE,
    });
  });
});
