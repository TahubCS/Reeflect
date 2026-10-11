import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import { cents } from "@/lib/money";
import { statementStore } from "@/lib/storage";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  commitPdfImportAction,
  discardImportAction,
  previewPdfImportAction,
} from "./actions";
import { listPreviews } from "./repository";

// Integration tests against the Docker database and S3Mock (TEST-05); only
// the session is faked. The isolation matrix covers other workspaces.
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

const f = fixtures();
let editor: string;
let workspace: string;
let accountId: string;

const pdf = (file: string) =>
  new File(
    [
      readFileSync(
        new URL(`../../../../tests/fixtures/pdf/${file}`, import.meta.url),
      ),
    ],
    file,
    { type: "application/pdf" },
  );

function form(entries: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

async function thrown(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the action to throw");
}

beforeAll(async () => {
  editor = await f.newUser();
  workspace = await f.newWorkspace({ [editor]: "editor" });
  accountId = await createAccount(workspace, {
    type: "checking",
    institutionName: "Capital One",
    nickname: "Everyday",
    maskLast4: "1234",
    balanceCents: cents(0),
  });
  getSession.mockResolvedValue({ user: { id: editor } });
});

afterAll(async () => {
  await statementStore()!.deletePrefix(`w/${workspace}/`);
  await f.cleanUp();
});

describe("previewPdfImportAction", () => {
  it.each([
    [
      "no account",
      { statement: pdf("capital-one-normal.pdf") },
      "Choose one of your accounts.",
    ],
    ["no file", { accountId: "" }, "Choose one of your accounts."],
  ])("asks again with %s", async (_name, entries, problem) => {
    expect(await previewPdfImportAction(workspace, {}, form(entries))).toEqual({
      problem,
    });
  });

  it("asks for a file, and refuses one over 10 MB before reading it", async () => {
    expect(
      await previewPdfImportAction(workspace, {}, form({ accountId })),
    ).toEqual({
      problem: "Choose a PDF statement to upload.",
      accountId,
    });
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf");
    expect(
      (
        await previewPdfImportAction(
          workspace,
          {},
          form({ accountId, statement: huge }),
        )
      ).problem,
    ).toContain("larger than 10 MB");
  });

  it("returns a blocked statement's checks and saves nothing", async () => {
    const state = await previewPdfImportAction(
      workspace,
      {},
      form({ accountId, statement: pdf("capital-one-off-by-a-cent.pdf") }),
    );
    expect(
      state.blocked?.checks.some((check) => check.outcome === "block"),
    ).toBe(true);
    expect(await listPreviews(workspace)).toEqual([]);
  });

  it("returns a problem in words", async () => {
    expect(
      (
        await previewPdfImportAction(
          workspace,
          {},
          form({ accountId, statement: pdf("other-bank.pdf") }),
        )
      ).problem,
    ).toBe("Only Capital One 360 statements can be read for now.");
  });

  it("saves a preview and goes to it", async () => {
    const error = await thrown(
      previewPdfImportAction(
        workspace,
        {},
        form({ accountId, statement: pdf("capital-one-normal.pdf") }),
      ),
    );
    expect(isRedirect(error)).toBe(true);
    expect(await listPreviews(workspace)).toHaveLength(1);
  });
});

describe("commitPdfImportAction and discardImportAction", () => {
  it("find nothing for an id that isn't one", async () => {
    expect(
      isNotFound(
        await thrown(commitPdfImportAction(workspace, "nope", {}, form({}))),
      ),
    ).toBe(true);
    expect(
      isNotFound(await thrown(discardImportAction(workspace, "nope"))),
    ).toBe(true);
  });

  it("explains what's missing, then imports and goes to the transactions", async () => {
    const [batch] = await listPreviews(workspace);
    expect(
      await commitPdfImportAction(workspace, batch!.id, {}, form({})),
    ).toEqual({
      problem: expect.stringContaining("Confirm it is for Capital One ••1234"),
    });
    const error = await thrown(
      commitPdfImportAction(
        workspace,
        batch!.id,
        {},
        form({ confirmIdentity: "yes" }),
      ),
    );
    expect(isRedirect(error)).toBe(true);
    expect(
      isNotFound(await thrown(discardImportAction(workspace, batch!.id))),
    ).toBe(true);
  });

  it("discards a waiting preview", async () => {
    await thrown(
      previewPdfImportAction(
        workspace,
        {},
        form({ accountId, statement: pdf("capital-one-unsigned-debits.pdf") }),
      ),
    );
    const [batch] = await listPreviews(workspace);
    expect(
      isRedirect(await thrown(discardImportAction(workspace, batch!.id))),
    ).toBe(true);
    expect(await listPreviews(workspace)).toEqual([]);
  });
});
