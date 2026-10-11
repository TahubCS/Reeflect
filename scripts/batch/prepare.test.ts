import { describe, expect, it } from "vitest";
import { PRESET_CATEGORIES } from "@/features/categorization/client";
import { GENERATOR_VERSION } from "@/features/synthetic";
import example from "../../tests/fixtures/synthetic/example-spec.json";
import { SpecError, parseUserMap, prepareBatch } from "./prepare";
import { formatPersonaTable, formatWarnings, personaRows } from "./report";
import { INSTITUTION, NAME_PREFIX, buildRows, personRows } from "./rows";

const options = { seed: "s1", today: "2026-10-10" };

describe("prepareBatch", () => {
  it("fills asOf with today and records the recipe", () => {
    const prepared = prepareBatch(structuredClone(example), {
      ...options,
      createdBy: "Jacob",
    });
    expect(prepared.spec.asOf).toBe("2026-10-10");
    expect(prepared.batch).toMatchObject({
      label: "Example: three personas",
      generatorVersion: GENERATOR_VERSION,
      seed: "s1",
      startMonth: "2026-07",
      months: 3,
      asOf: "2026-10-10",
      notes: null,
      createdBy: "Jacob",
      promotedFrom: null,
    });
    // The stored spec carries asOf, so a replay stops on the same day.
    expect((prepared.batch.spec as { asOf: string }).asOf).toBe("2026-10-10");
    expect(prepared.warnings).toEqual([]);
  });

  it("keeps an asOf the spec already has, and takes a label override", () => {
    const prepared = prepareBatch(
      { ...structuredClone(example), asOf: "2026-08-31" },
      { ...options, label: "Smaller", notes: "n", promotedFrom: "branch" },
    );
    expect(prepared.batch).toMatchObject({
      asOf: "2026-08-31",
      label: "Smaller",
      notes: "n",
      promotedFrom: "branch",
    });
    for (const p of prepared.expansion.people) {
      for (const t of p.transactions)
        expect(t.postedOn <= "2026-08-31").toBe(true);
    }
  });

  it("rejects an invalid spec with its problems", () => {
    expect(() => prepareBatch({ version: 2 }, options)).toThrow(SpecError);
    try {
      prepareBatch({ ...structuredClone(example), months: 0 }, options);
    } catch (error) {
      expect((error as SpecError).problems[0]).toMatch(/^months:/);
    }
  });

  it("rejects a today that is before the span starts", () => {
    expect(() =>
      prepareBatch(structuredClone(example), {
        ...options,
        today: "2026-01-01",
      }),
    ).toThrow("is before the span starts");
  });
});

describe("buildRows", () => {
  const prepared = prepareBatch(structuredClone(example), options);
  let n = 0;
  const rows = buildRows(prepared.expansion, {
    batchId: "batch-1",
    now: new Date("2026-10-10T12:00:00Z"),
    newId: () => `id-${(n += 1)}`,
  });

  it("makes one marked, Sample-labelled workspace per person", () => {
    expect(rows.organizations).toHaveLength(3);
    expect(rows.organizations[0]).toMatchObject({
      name: `${NAME_PREFIX}Dana Whitfield`,
      slug: "synthetic-batch-1-p2p-01",
    });
    expect(JSON.parse(rows.organizations[0]!.metadata!)).toEqual({
      synthetic: true,
      batchId: "batch-1",
    });
    expect(rows.markers.map((m) => [m.personKey, m.persona])).toEqual([
      ["p2p-01", "paycheck_to_paycheck"],
      ["tech-01", "upper_middle_tech"],
      ["retiree-01", "retiree"],
    ]);
    expect(rows.markers.every((m) => m.batchId === "batch-1")).toBe(true);
  });

  it("stores each account's balance as of the last day generated", () => {
    expect(rows.accounts).toHaveLength(7);
    const people = prepared.expansion.people.flatMap((p) => p.accounts);
    rows.accounts.forEach((a, i) => {
      expect(a).toMatchObject({
        institutionName: INSTITUTION,
        source: "synthetic",
        balanceAsOf: "2026-09-30", // the span ends before today
        currentBalanceCents: people[i]!.closingBalance,
        type: people[i]!.type,
      });
    });
  });

  it("links every transaction to its workspace and account, with stable ids", () => {
    const total = prepared.expansion.people.reduce(
      (sum, p) => sum + p.transactions.length,
      0,
    );
    expect(rows.transactions).toHaveLength(total);
    const accountIds = new Set(rows.accounts.map((a) => a.id));
    const workspaceOf = new Map(
      rows.accounts.map((a) => [a.id, a.workspaceId]),
    );
    for (const t of rows.transactions) {
      expect(accountIds.has(t.financialAccountId)).toBe(true);
      expect(workspaceOf.get(t.financialAccountId)).toBe(t.workspaceId);
      expect(t.fingerprint).toBe(`synthetic:${t.externalId}`);
    }
  });

  it("gives both sides of a transfer one shared pair id (ADR-020)", () => {
    const transfers = rows.transactions.filter((t) => t.isTransfer);
    expect(transfers.length).toBeGreaterThan(0);
    const byPair = new Map<string, number>();
    for (const t of transfers) {
      byPair.set(t.transferPairId!, (byPair.get(t.transferPairId!) ?? 0) + 1);
    }
    expect([...byPair.values()].every((count) => count === 2)).toBe(true);
    expect(
      rows.transactions
        .filter((t) => !t.isTransfer)
        .every((t) => t.transferPairId === null),
    ).toBe(true);
  });
});

describe("buildRows categories (ADR-057)", () => {
  const prepared = prepareBatch(structuredClone(example), options);
  let n = 0;
  const rows = buildRows(prepared.expansion, {
    batchId: "batch-1",
    now: new Date("2026-10-10T12:00:00Z"),
    newId: () => `id-${(n += 1)}`,
  });
  const categoryWorkspace = new Map(
    rows.categories.map((c) => [c.id!, c.workspaceId]),
  );

  it("seeds F-08's presets in each workspace, in F-08's order", () => {
    for (const org of rows.organizations) {
      const mine = rows.categories.filter((c) => c.workspaceId === org.id);
      expect(mine.map((c) => [c.presetKey, c.name, c.sortOrder])).toEqual(
        PRESET_CATEGORIES.map((p, i) => [p.key, p.name, i]),
      );
    }
  });

  it("only ever points at a category in the same workspace", () => {
    expect(rows.rules.length).toBeGreaterThan(0);
    for (const r of rows.rules) {
      expect(r.matchType).toBe("exact");
      expect(categoryWorkspace.get(r.categoryId)).toBe(r.workspaceId);
    }
    for (const t of rows.transactions) {
      if (t.categoryId) {
        expect(categoryWorkspace.get(t.categoryId)).toBe(t.workspaceId);
      }
    }
  });

  it("categorizes pay as income and leaves transfer pairs Uncategorized", () => {
    const presetOf = new Map(rows.categories.map((c) => [c.id!, c.presetKey]));
    const people = prepared.expansion.people.flatMap((p) => p.transactions);
    const kindOf = new Map(people.map((t) => [t.id, t.kind]));
    for (const t of rows.transactions) {
      const kind = kindOf.get(t.externalId!);
      if (kind === "income") expect(presetOf.get(t.categoryId!)).toBe("income");
      if (kind === "transfer") {
        expect(t.categoryId).toBeNull();
        expect(t.categoryIsManual).toBe(false);
      }
    }
  });
});

describe("buildRows with investing", () => {
  it("marks money into an IRA or brokerage as not spending, with no pair (ADR-055)", () => {
    const input = structuredClone(example);
    (input.people[1] as Record<string, unknown>).investing = [
      { name: "SCHWAB BROKERAGE TRANSFER", amountCents: 150_000, day: 20 },
    ];
    let n = 0;
    const rows = buildRows(prepareBatch(input, options).expansion, {
      batchId: "batch-1",
      now: new Date("2026-10-10T12:00:00Z"),
      newId: () => `id-${(n += 1)}`,
    });
    const invested = rows.transactions.filter(
      (t) => t.descriptionRaw === "SCHWAB BROKERAGE TRANSFER",
    );
    expect(invested).toHaveLength(3);
    for (const t of invested) {
      expect(t).toMatchObject({
        amountCents: -150_000,
        isTransfer: true,
        transferPairId: null,
      });
      const saved = rows.categories.find((c) => c.id === t.categoryId);
      expect(saved?.presetKey).toBe("investing");
    }
  });
});

describe("report", () => {
  it("summarises each persona in a table", () => {
    const prepared = prepareBatch(structuredClone(example), options);
    const rows = personaRows(prepared.expansion);
    expect(rows.map((r) => [r.persona, r.people])).toEqual([
      ["paycheck_to_paycheck", 1],
      ["upper_middle_tech", 1],
      ["retiree", 1],
    ]);
    expect(rows[2]!.incomePerMonth).toBe(314_631);
    const table = formatPersonaTable(rows);
    expect(table[0]).toMatch(/^Persona\s+People\s+Income\/mo/);
    expect(table[3]).toMatch(/^retiree\s+1\s+\$3,146/);
  });

  it("averages people with the same persona and keeps the lowest balance", () => {
    const spec = structuredClone(example);
    spec.people.push({
      ...structuredClone(spec.people[2]!),
      key: "retiree-02",
    });
    spec.people[3]!.accounts.checking.openingBalanceCents = 100;
    const rows = personaRows(prepareBatch(spec, options).expansion);
    const retirees = rows.find((r) => r.persona === "retiree")!;
    expect(retirees.people).toBe(2);
    expect(retirees.lowestChecking).toBeLessThan(512_000);
  });

  it("lists warnings, or says there are none", () => {
    expect(formatWarnings([])).toEqual(["Checks: nothing to flag."]);
    expect(formatWarnings([{ person: "p1", message: "odd" }])).toEqual([
      "Checks: 1 to review (warnings only; the batch still loads)",
      "  p1: odd",
    ]);
  });
});

describe("parseUserMap (ADR-059)", () => {
  it("maps spec people to user ids", () => {
    expect(parseUserMap(["jacob=abc", "simon=def"])).toEqual(
      new Map([
        ["jacob", "abc"],
        ["simon", "def"],
      ]),
    );
  });

  it.each([["jacob"], ["=abc"], ["jacob="], ["a=b=c"]])(
    "rejects %s",
    (value) => {
      expect(() => parseUserMap([value])).toThrow("<personKey>=<userId>");
    },
  );

  it("rejects a person given twice", () => {
    expect(() => parseUserMap(["jacob=a", "jacob=b"])).toThrow("twice");
  });
});

describe("personRows", () => {
  it("writes into the given workspace with its category ids and labelled accounts", () => {
    const { expansion } = prepareBatch(structuredClone(example), options);
    const person = expansion.people[0]!;
    let n = 0;
    const categoryIds = new Map(
      PRESET_CATEGORIES.map((p) => [p.key, `existing-${p.key}`]),
    );
    const rows = personRows(person, {
      workspaceId: "ws-real",
      categoryIds,
      asOf: expansion.asOf,
      newId: () => `id-${n++}`,
      nicknamePrefix: NAME_PREFIX,
    });
    expect(rows.transactions).toHaveLength(person.transactions.length);
    for (const row of [...rows.accounts, ...rows.transactions, ...rows.rules]) {
      expect(row.workspaceId).toBe("ws-real");
    }
    for (const account of rows.accounts) {
      expect(account.nickname?.startsWith(NAME_PREFIX)).toBe(true);
      expect(account.source).toBe("synthetic");
    }
    const known = new Set(categoryIds.values());
    expect(rows.transactions.some((t) => t.categoryId)).toBe(true);
    for (const t of rows.transactions) {
      if (t.categoryId) expect(known.has(t.categoryId)).toBe(true);
    }
  });
});
