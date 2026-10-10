// `pnpm docs:check`: fails when the docs and config disagree with each other.
// The six checks are listed in docs/TESTING.md, TEST-09. It checks references
// only; whether the prose still matches the build is left to review.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type TextFile = { readonly path: string; readonly text: string };

export type DocsCheckInput = {
  /** Every file whose ADR-, ARCH-, TEST- and HO- citations are checked. */
  readonly files: readonly TextFile[];
  /** Workflow files under .github/workflows. */
  readonly workflows: readonly TextFile[];
  readonly packageScripts: readonly string[];
  readonly requiredChecks: readonly string[];
  readonly fileExists: (path: string) => boolean;
};

type IdKind = "ADR" | "ARCH" | "TEST" | "HO";

const HEADINGS: Record<IdKind, { file: string; pattern: RegExp }> = {
  ADR: { file: "docs/DECISIONS.md", pattern: /^### (ADR-\d+):/gm },
  ARCH: { file: "docs/ARCHITECTURE.md", pattern: /^## (ARCH-\d+):/gm },
  TEST: { file: "docs/TESTING.md", pattern: /^## (TEST-\d+):/gm },
  HO: { file: "docs/HANDOFF.md", pattern: /^## (HO-\d+):/gm },
};

const ID_KINDS: readonly IdKind[] = ["ADR", "ARCH", "TEST", "HO"];
const CITATION = /\b(?:ADR|ARCH|TEST|HO)-\d+\b/g;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

function findFile(
  files: readonly TextFile[],
  path: string,
): TextFile | undefined {
  return files.find((file) => file.path === path);
}

function numberOf(id: string): number {
  return Number(id.slice(id.indexOf("-") + 1));
}

function headingIds(files: readonly TextFile[], kind: IdKind): string[] {
  const { file, pattern } = HEADINGS[kind];
  const text = findFile(files, file)?.text ?? "";
  return [...text.matchAll(pattern)].flatMap((match) => match[1] ?? []);
}

/** ADR numbers listed as retired in DECISIONS.md. They may be cited, never reused. */
export function retiredAdrIds(decisions: string): string[] {
  const start = decisions.indexOf("**Retired numbers");
  if (start === -1) return [];
  const end = decisions.indexOf("\n\n", start);
  const paragraph = decisions.slice(start, end === -1 ? undefined : end);
  // Parentheses name the ADRs that replaced the retired ones.
  return paragraph.replace(/\([^)]*\)/g, "").match(/\bADR-\d+\b/g) ?? [];
}

function checkCitations(input: DocsCheckInput): string[] {
  const decisions = findFile(input.files, HEADINGS.ADR.file)?.text ?? "";
  const known = new Set([
    ...ID_KINDS.flatMap((kind) => headingIds(input.files, kind)),
    ...retiredAdrIds(decisions),
  ]);
  const problems: string[] = [];
  for (const file of input.files) {
    const cited = new Set(file.text.match(CITATION) ?? []);
    for (const id of cited) {
      if (!known.has(id)) {
        problems.push(`${file.path}: cites ${id}, which has no heading`);
      }
    }
  }
  return problems;
}

function checkSequences(input: DocsCheckInput): string[] {
  const decisions = findFile(input.files, HEADINGS.ADR.file)?.text ?? "";
  const retired = new Set(retiredAdrIds(decisions).map(numberOf));
  const problems: string[] = [];

  for (const kind of ID_KINDS) {
    const ids = headingIds(input.files, kind);
    const numbers = ids.map(numberOf);
    const seen = new Set<number>();
    for (const [index, value] of numbers.entries()) {
      if (seen.has(value)) {
        problems.push(`${HEADINGS[kind].file}: ${ids[index]} appears twice`);
      }
      seen.add(value);
      if (kind === "ADR" && retired.has(value)) {
        problems.push(`${HEADINGS[kind].file}: ${ids[index]} is retired`);
      }
    }
    const highest = Math.max(0, ...numbers);
    for (let expected = 1; expected <= highest; expected += 1) {
      const skipped = kind === "ADR" && retired.has(expected);
      if (!seen.has(expected) && !skipped) {
        problems.push(
          `${HEADINGS[kind].file}: ${kind} number ${expected} is missing`,
        );
      }
    }
  }

  const sections = decisions.split(/^(?=### ADR-\d+:)/m).slice(1);
  for (const section of sections) {
    const body = section.split(/^## /m)[0] ?? "";
    if (!/^- \*\*Status:\*\*/m.test(body)) {
      const id = body.match(/^### (ADR-\d+):/)?.[1] ?? "an ADR";
      problems.push(`${HEADINGS.ADR.file}: ${id} has no Status line`);
    }
  }
  return problems;
}

function checkSuperseded(input: DocsCheckInput): string[] {
  const adrs = new Set(headingIds(input.files, "ADR"));
  const problems: string[] = [];
  for (const file of input.files) {
    for (const match of file.text.matchAll(/Superseded by (ADR-\d+)\b/g)) {
      const id = match[1];
      if (id !== undefined && !adrs.has(id)) {
        problems.push(
          `${file.path}: "Superseded by ${id}" names an ADR that does not exist`,
        );
      }
    }
  }
  return problems;
}

/** Commands in the first table of AGENTS.md section 5, without the `pnpm ` prefix. */
export function agentsCommands(agentsMd: string): string[] {
  const start = agentsMd.search(/^## 5\. /m);
  if (start === -1) return [];
  const commands: string[] = [];
  let inTable = false;
  for (const line of agentsMd.slice(start).split(/\r?\n/).slice(1)) {
    if (line.startsWith("|")) {
      inTable = true;
      const command = line.match(/^\| `pnpm ([^` ]+)` \|/)?.[1];
      if (command !== undefined) commands.push(command);
    } else if (inTable) {
      break;
    }
  }
  return commands;
}

function checkCommands(input: DocsCheckInput): string[] {
  const documented = new Set(
    agentsCommands(findFile(input.files, "AGENTS.md")?.text ?? ""),
  );
  const scripts = new Set(input.packageScripts);
  const problems: string[] = [];
  for (const command of documented) {
    if (!scripts.has(command)) {
      problems.push(
        `AGENTS.md: section 5 lists \`pnpm ${command}\`, which is not a package.json script`,
      );
    }
  }
  for (const script of scripts) {
    if (!documented.has(script)) {
      problems.push(
        `package.json: script "${script}" is missing from the AGENTS.md section 5 table`,
      );
    }
  }
  return problems;
}

/** Names of the jobs in a workflow file, as GitHub reports them as status checks. */
export function workflowJobNames(workflow: string): string[] {
  const names: string[] = [];
  let inJobs = false;
  for (const line of workflow.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inJobs = /^jobs:\s*$/.test(line);
      continue;
    }
    if (!inJobs) continue;
    const jobId = line.match(/^ {2}([\w-]+):\s*$/)?.[1];
    if (jobId !== undefined) {
      names.push(jobId);
      continue;
    }
    const name = line.match(/^ {4}name:\s*(.+?)\s*$/)?.[1];
    if (name !== undefined && names.length > 0) {
      names[names.length - 1] = name.replace(/^['"]|['"]$/g, "");
    }
  }
  return names;
}

function checkRequiredChecks(input: DocsCheckInput): string[] {
  const jobs = new Set(
    input.workflows
      .filter((workflow) => /^ {2}pull_request:/m.test(workflow.text))
      .flatMap((workflow) => workflowJobNames(workflow.text)),
  );
  const required = new Set(input.requiredChecks);
  const problems: string[] = [];
  for (const check of required) {
    if (!jobs.has(check)) {
      problems.push(
        `.github/rulesets/main.json: required check "${check}" is not a pull-request CI job`,
      );
    }
  }
  for (const job of jobs) {
    if (!required.has(job)) {
      problems.push(
        `.github/workflows: job "${job}" runs on pull requests but is not a required check`,
      );
    }
  }
  return problems;
}

function checkLinks(input: DocsCheckInput): string[] {
  const problems: string[] = [];
  for (const file of input.files) {
    if (!file.path.endsWith(".md")) continue;
    for (const match of file.text.matchAll(MARKDOWN_LINK)) {
      const target = (match[1] ?? "").split("#")[0] ?? "";
      if (target === "" || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const linked = join(dirname(file.path), target).replaceAll("\\", "/");
      if (!input.fileExists(linked)) {
        problems.push(`${file.path}: links to ${target}, which does not exist`);
      }
    }
  }
  return problems;
}

export function checkDocs(input: DocsCheckInput): string[] {
  return [
    ...checkCitations(input),
    ...checkSequences(input),
    ...checkSuperseded(input),
    ...checkCommands(input),
    ...checkRequiredChecks(input),
    ...checkLinks(input),
  ];
}

function listFiles(root: string, directory: string): string[] {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = `${directory}/${name}`;
    return statSync(join(root, path)).isDirectory()
      ? listFiles(root, path)
      : [path];
  });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPackageScripts(root: string): string[] {
  const manifest = readJson(join(root, "package.json"));
  if (!isRecord(manifest) || !isRecord(manifest.scripts)) {
    throw new Error("package.json has no scripts object");
  }
  return Object.keys(manifest.scripts);
}

function readRequiredChecks(root: string): string[] {
  const ruleset = readJson(join(root, ".github/rulesets/main.json"));
  const rules =
    isRecord(ruleset) && Array.isArray(ruleset.rules) ? ruleset.rules : [];
  const rule = rules.find(
    (candidate) =>
      isRecord(candidate) && candidate.type === "required_status_checks",
  );
  const parameters = isRecord(rule) ? rule.parameters : undefined;
  const checks = isRecord(parameters)
    ? parameters.required_status_checks
    : undefined;
  if (!Array.isArray(checks)) {
    throw new Error(".github/rulesets/main.json has no required_status_checks");
  }
  return checks.flatMap((check) =>
    isRecord(check) && typeof check.context === "string" ? [check.context] : [],
  );
}

export function loadRepo(root: string): DocsCheckInput {
  const read = (path: string): TextFile => ({
    path,
    text: readFileSync(join(root, path), "utf8"),
  });
  const cited = [
    "AGENTS.md",
    ".coderabbit.yaml",
    ...listFiles(root, "docs").filter((path) => path.endsWith(".md")),
    ...listFiles(root, ".github"),
    ...listFiles(root, "src").filter((path) => /\.(ts|tsx|css)$/.test(path)),
  ].filter((path) => existsSync(join(root, path)));

  return {
    files: cited.map(read),
    workflows: listFiles(root, ".github/workflows").map(read),
    packageScripts: readPackageScripts(root),
    requiredChecks: readRequiredChecks(root),
    fileExists: (path) => existsSync(join(root, path)),
  };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const problems = checkDocs(loadRepo(root));
  if (problems.length === 0) {
    console.log("docs:check passed");
    return;
  }
  for (const problem of problems) console.error(problem);
  console.error(`\ndocs:check failed: ${problems.length} problem(s)`);
  process.exitCode = 1;
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  relative(entry, fileURLToPath(import.meta.url)) === ""
) {
  main();
}
