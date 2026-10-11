import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccount } from "@/features/accounts/server/repository";
import { cents } from "@/lib/money";
import { testStore } from "../../../../tests/support/storage";
import {
  fixtures,
  isNotFound,
  isRedirect,
} from "../../../../tests/support/db-fixtures";
import {
  commitImportAction,
  discardImportAction,
  previewImportAction,
} from "./actions";
import { listPreviews } from "./repository";

// Integration tests against the Docker database and the Neon
// `storage-tests` bucket (TEST-05, ADR-053); only
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

const csv = (file: string) =>
  new File(
    [
      readFileSync(
        new URL(`../../../../tests/fixtures/csv/${file}`, import.meta.url),
      ),
    ],
    file,
    { type: "text/csv" },
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
  await testStore().deletePrefix(`w/${workspace}/`);
  await f.cleanUp();
});

describe("previewImportAction", () => {
  it.each([
    [
      "no account",
      { statement: pdf("capital-one-normal.pdf") },
      "Choose one of your accounts.",
    ],
    ["no file", { accountId: "" }, "Choose one of your accounts."],
  ])("asks again with %s", async (_name, entries, problem) => {
    expect(await previewImportAction(workspace, {}, form(entries))).toEqual({
      problem,
    });
  });

  it("asks for a file, and refuses one over 10 MB before reading it", async () => {
    expect(
      await previewImportAction(workspace, {}, form({ accountId })),
    ).toEqual({
      problem: "Choose a statement to upload: a PDF, or a CSV export.",
      accountId,
    });
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf");
    expect(
      (
        await previewImportAction(
          workspace,
          {},
          form({ accountId, statement: huge }),
        )
      ).problem,
    ).toContain("larger than 10 MB");
  });

  it("refuses a CSV over 2 MB before reading it", async () => {
    const huge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv", {
      type: "text/csv",
    });
    expect(
      (
        await previewImportAction(
          workspace,
          {},
          form({ accountId, statement: huge }),
        )
      ).problem,
    ).toContain("larger than 2 MB");
  });

  it("returns a blocked statement's checks and saves nothing", async () => {
    const state = await previewImportAction(
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
        await previewImportAction(
          workspace,
          {},
          form({ accountId, statement: pdf("other-bank.pdf") }),
        )
      ).problem,
    ).toBe("Only Capital One 360 statements can be read for now.");
  });

  it("saves a preview and goes to it", async () => {
    const error = await thrown(
      previewImportAction(
        workspace,
        {},
        form({ accountId, statement: pdf("capital-one-normal.pdf") }),
      ),
    );
    expect(isRedirect(error)).toBe(true);
    expect(await listPreviews(workspace)).toHaveLength(1);
  });
});

describe("commitImportAction and discardImportAction", () => {
  it("find nothing for an id that isn't one", async () => {
    expect(
      isNotFound(
        await thrown(commitImportAction(workspace, "nope", {}, form({}))),
      ),
    ).toBe(true);
    expect(
      isNotFound(await thrown(discardImportAction(workspace, "nope"))),
    ).toBe(true);
  });

  it("explains what's missing, then imports and goes to the transactions", async () => {
    const [batch] = await listPreviews(workspace);
    expect(
      await commitImportAction(workspace, batch!.id, {}, form({})),
    ).toEqual({
      problem: expect.stringContaining("Confirm it is for Capital One ••1234"),
    });
    const error = await thrown(
      commitImportAction(
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
      previewImportAction(
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

describe("a CSV export", () => {
  it("is read, checked and saved as a preview, then discarded", async () => {
    const error = await thrown(
      previewImportAction(
        workspace,
        {},
        form({ accountId, statement: csv("capital-one-360-normal.csv") }),
      ),
    );
    expect(isRedirect(error)).toBe(true);
    const [batch] = await listPreviews(workspace);
    expect(batch).toMatchObject({ kind: "csv", rowsParsed: 5 });
    await thrown(discardImportAction(workspace, batch!.id));
    expect(await listPreviews(workspace)).toEqual([]);
  });

  it("returns another bank's export as a problem in words", async () => {
    expect(
      (
        await previewImportAction(
          workspace,
          {},
          form({ accountId, statement: csv("other-bank.csv") }),
        )
      ).problem,
    ).toBe(
      "Only Capital One CSV exports can be read for now: 360 checking and savings, and credit cards.",
    );
  });
});
