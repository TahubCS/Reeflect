import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  agentsCommands,
  checkDocs,
  loadRepo,
  reservedBlocks,
  retiredAdrIds,
  workflowJobNames,
  type DocsCheckInput,
  type TextFile,
} from "./docs-check";

const DECISIONS = `# DECISIONS

**Retired numbers, never reused:** ADR-002 (replaced by ADR-003).

### ADR-001: First

- **Status:** Superseded by ADR-003

### ADR-003: Third

- **Status:** Accepted
`;

const AGENTS = `# AGENTS

Follow ADR-003, ARCH-01 and TEST-01. ADR-002 is retired.

## 5. Commands

| Command | Purpose |
|---|---|
| \`pnpm lint\` | ESLint |
| \`pnpm test:unit\` | Vitest |

Not defined yet:

| Command | Purpose |
|---|---|
| \`pnpm db:migrate\` | Apply migrations |

## 6. Structure
`;

const CI = `name: CI
on:
  pull_request:
    branches: [main]
jobs:
  lint:
    name: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - name: not a job
        run: pnpm lint
  unit:
    runs-on: ubuntu-latest
`;

const NIGHTLY = `name: Nightly
on:
  schedule:
    - cron: "0 8 * * *"
jobs:
  external:
    runs-on: ubuntu-latest
`;

function repo(overrides: Partial<DocsCheckInput> = {}): DocsCheckInput {
  const files: TextFile[] = [
    { path: "AGENTS.md", text: AGENTS },
    { path: "docs/DECISIONS.md", text: DECISIONS },
    { path: "docs/ARCHITECTURE.md", text: "## ARCH-01: Overview\n" },
    { path: "docs/TESTING.md", text: "## TEST-01: Tools\n" },
    {
      path: "docs/HANDOFF.md",
      text: "## HO-001: Start\n\nSee [testing](TESTING.md).\n",
    },
  ];
  return {
    files,
    workflows: [
      { path: ".github/workflows/ci.yml", text: CI },
      { path: ".github/workflows/nightly.yml", text: NIGHTLY },
    ],
    packageScripts: ["lint", "test:unit"],
    requiredChecks: ["lint-typecheck", "unit"],
    fileExists: (path) => files.some((file) => file.path === path),
    ...overrides,
  };
}

function withFile(path: string, text: string): Partial<DocsCheckInput> {
  const base = repo();
  const files = [
    ...base.files.filter((file) => file.path !== path),
    { path, text },
  ];
  return {
    files,
    fileExists: (candidate) => files.some((file) => file.path === candidate),
  };
}

describe("checkDocs", () => {
  it("passes when docs and config agree", () => {
    expect(checkDocs(repo())).toEqual([]);
  });

  it("fails when a cited id has no heading", () => {
    const problems = checkDocs(
      repo(withFile("src/app/page.tsx", "// see ADR-099")),
    );

    expect(problems).toEqual([
      "src/app/page.tsx: cites ADR-099, which has no heading",
    ]);
  });

  it("allows a retired ADR number to be cited but not reused", () => {
    const reused = `${DECISIONS}\n### ADR-002: Reused\n\n- **Status:** Accepted\n`;

    expect(checkDocs(repo(withFile("docs/DECISIONS.md", reused)))).toEqual([
      "docs/DECISIONS.md: ADR-002 is retired",
    ]);
  });

  it("fails when a number is skipped", () => {
    const text = "## TEST-01: Tools\n\n## TEST-03: Coverage\n";

    expect(checkDocs(repo(withFile("docs/TESTING.md", text)))).toEqual([
      "docs/TESTING.md: TEST number 2 is missing",
    ]);
  });

  it("fails when an id is used for two headings", () => {
    const text = "## ARCH-01: Overview\n\n## ARCH-01: Again\n";

    expect(checkDocs(repo(withFile("docs/ARCHITECTURE.md", text)))).toEqual([
      "docs/ARCHITECTURE.md: ARCH-01 appears twice",
    ]);
  });

  describe("reserved blocks (ADR-084)", () => {
    const agents = `${AGENTS}
## 9. End of every session

### Reserved numbers

| Developer | ADR numbers | HO numbers |
|---|---|---|
| Ana | 004–005 | 002–003 |
| Ben | 006–007 | 004–005 |

## 10. Team
`;
    const withBlocks = (path: string, text: string) => {
      const base = withFile(path, text);
      const files = [
        ...base.files!.filter((file) => file.path !== "AGENTS.md"),
        { path: "AGENTS.md", text: agents },
      ];
      return repo({ ...base, files });
    };

    it("allows unused numbers inside a block", () => {
      const decisions = `${DECISIONS}\n### ADR-006: Ben's first\n\n- **Status:** Proposed\n`;
      const handoff = "## HO-001: Start\n\n## HO-004: Ben\n\n## HO-002: Ana\n";
      const input = withBlocks("docs/DECISIONS.md", decisions);
      const files = input.files.map((file) =>
        file.path === "docs/HANDOFF.md" ? { ...file, text: handoff } : file,
      );

      expect(checkDocs({ ...input, files })).toEqual([]);
    });

    it("fails on a number outside every block", () => {
      const decisions = `${DECISIONS}\n### ADR-009: Nobody's\n\n- **Status:** Proposed\n`;

      expect(checkDocs(withBlocks("docs/DECISIONS.md", decisions))).toEqual([
        "docs/DECISIONS.md: ADR-009 is outside every reserved block (AGENTS.md section 9)",
        "docs/DECISIONS.md: ADR number 8 is missing",
      ]);
    });

    it("still fails on a gap in the shared numbers", () => {
      const handoff = "## HO-002: Ana\n";

      expect(checkDocs(withBlocks("docs/HANDOFF.md", handoff))).toEqual([
        "docs/HANDOFF.md: HO number 1 is missing",
      ]);
    });
  });

  it("fails when an ADR has no Status line", () => {
    const text = `${DECISIONS}\n### ADR-004: Fourth\n\n- **Decision:** Something.\n`;

    expect(checkDocs(repo(withFile("docs/DECISIONS.md", text)))).toEqual([
      "docs/DECISIONS.md: ADR-004 has no Status line",
    ]);
  });

  it("fails when an ADR is superseded by a retired or missing ADR", () => {
    const text = DECISIONS.replace(
      "Superseded by ADR-003",
      "Superseded by ADR-002",
    );

    expect(checkDocs(repo(withFile("docs/DECISIONS.md", text)))).toEqual([
      'docs/DECISIONS.md: "Superseded by ADR-002" names an ADR that does not exist',
    ]);
  });

  it("ignores the ADR template's placeholder ids", () => {
    const text = `${DECISIONS}\n- **Status:** Proposed | Superseded by ADR-0YY\n`;

    expect(checkDocs(repo(withFile("docs/DECISIONS.md", text)))).toEqual([]);
  });

  it("fails when AGENTS.md lists a command that package.json lacks", () => {
    expect(checkDocs(repo({ packageScripts: ["lint"] }))).toEqual([
      "AGENTS.md: section 5 lists `pnpm test:unit`, which is not a package.json script",
    ]);
  });

  it("fails when package.json has a script AGENTS.md does not list", () => {
    expect(
      checkDocs(repo({ packageScripts: ["lint", "test:unit", "deploy"] })),
    ).toEqual([
      'package.json: script "deploy" is missing from the AGENTS.md section 5 table',
    ]);
  });

  it("fails when a required check is not a pull-request job", () => {
    const problems = checkDocs(
      repo({ requiredChecks: ["lint-typecheck", "unit", "external"] }),
    );

    expect(problems).toEqual([
      '.github/rulesets/main.json: required check "external" is not a pull-request CI job',
    ]);
  });

  it("fails when a pull-request job is not a required check", () => {
    expect(checkDocs(repo({ requiredChecks: ["lint-typecheck"] }))).toEqual([
      '.github/workflows: job "unit" runs on pull requests but is not a required check',
    ]);
  });

  it("fails when a relative link points to a missing file", () => {
    const text =
      "## HO-001: Start\n\n[gone](./MISSING.md) [site](https://example.com) [top](#top)\n";

    expect(checkDocs(repo(withFile("docs/HANDOFF.md", text)))).toEqual([
      "docs/HANDOFF.md: links to ./MISSING.md, which does not exist",
    ]);
  });
});

describe("retiredAdrIds", () => {
  it("reads the retired ids, not the replacements named in parentheses", () => {
    expect(retiredAdrIds(DECISIONS)).toEqual(["ADR-002"]);
  });

  it("returns nothing when no numbers are retired", () => {
    expect(retiredAdrIds("# DECISIONS\n")).toEqual([]);
  });
});

describe("agentsCommands", () => {
  it("reads only the first table of section 5", () => {
    expect(agentsCommands(AGENTS)).toEqual(["lint", "test:unit"]);
  });

  it("returns nothing when section 5 is missing", () => {
    expect(agentsCommands("# AGENTS\n")).toEqual([]);
  });
});

describe("workflowJobNames", () => {
  it("uses a job's name when it has one and its id otherwise", () => {
    expect(workflowJobNames(CI)).toEqual(["lint-typecheck", "unit"]);
  });
});

describe("loadRepo", () => {
  let root: string;

  function write(path: string, text: string): void {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "docs-check-"));
    write("AGENTS.md", AGENTS);
    write("docs/DECISIONS.md", DECISIONS);
    write("docs/ARCHITECTURE.md", "## ARCH-01: Overview\n");
    write("docs/TESTING.md", "## TEST-01: Tools\n");
    write("docs/HANDOFF.md", "## HO-001: Start\n");
    write(".github/workflows/ci.yml", CI);
    write(".github/workflows/nightly.yml", NIGHTLY);
    write(
      ".github/rulesets/main.json",
      JSON.stringify({
        rules: [
          { type: "deletion" },
          {
            type: "required_status_checks",
            parameters: {
              required_status_checks: [
                { context: "lint-typecheck" },
                { context: "unit" },
              ],
            },
          },
        ],
      }),
    );
    write(
      "package.json",
      JSON.stringify({ scripts: { lint: "eslint", "test:unit": "vitest" } }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("reads a consistent repository from disk and finds no problems", () => {
    expect(checkDocs(loadRepo(root))).toEqual([]);
  });

  it("includes source files, so a bad citation in code is caught", () => {
    write("src/app/page.tsx", "// governed by ADR-099");

    expect(checkDocs(loadRepo(root))).toEqual([
      "src/app/page.tsx: cites ADR-099, which has no heading",
    ]);
  });

  it("fails loudly when the ruleset has no required checks", () => {
    write(".github/rulesets/main.json", JSON.stringify({ rules: [] }));

    expect(() => loadRepo(root)).toThrow("no required_status_checks");
  });

  it("fails loudly when package.json has no scripts", () => {
    write("package.json", JSON.stringify({ name: "x" }));

    expect(() => loadRepo(root)).toThrow("no scripts object");
  });
});

describe("reservedBlocks", () => {
  it("reads each developer's ADR and HO ranges", () => {
    const agents =
      "### Reserved numbers\n\n| Developer | ADR numbers | HO numbers |\n|---|---|---|\n| Ana | 062–081 | 055-074 |\n\n## 10. Team\n| Bob | 1–2 | 3–4 |\n";

    expect(reservedBlocks(agents)).toEqual([
      { owner: "Ana", kind: "ADR", from: 62, to: 81 },
      { owner: "Ana", kind: "HO", from: 55, to: 74 },
    ]);
  });

  it("returns nothing without the table", () => {
    expect(reservedBlocks("# AGENTS\n")).toEqual([]);
  });
});
