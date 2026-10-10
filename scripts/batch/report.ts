// Text tables for `batch load` and `batch report`: one line per persona.
import {
  type Expansion,
  type PersonStats,
  type Warning,
  personStats,
  statsWindow,
} from "@/features/synthetic";
import { type Cents, ZERO, add, formatCents, fraction } from "@/lib/money";

export type PersonaRow = {
  persona: string;
  people: number;
  incomePerMonth: Cents;
  spendingPerMonth: Cents;
  lowestChecking: Cents;
  transactions: number;
};

/**
 * Averages per persona, per month through the last complete month;
 * `lowestChecking` is the lowest of anyone's over the whole span.
 */
export function personaRows(expansion: Expansion): PersonaRow[] {
  const window = statsWindow(expansion);
  const groups = new Map<string, PersonStats[]>();
  for (const person of expansion.people) {
    const stats = personStats(person, window);
    groups.set(person.persona, [...(groups.get(person.persona) ?? []), stats]);
  }
  return [...groups].map(([persona, list]) => {
    const total = (pick: (s: PersonStats) => Cents) =>
      list.reduce((acc, s) => add(acc, pick(s)), ZERO);
    return {
      persona,
      people: list.length,
      incomePerMonth: fraction(
        total((s) => s.incomePerMonth),
        1,
        list.length,
      ),
      spendingPerMonth: fraction(
        total((s) => s.spendingPerMonth),
        1,
        list.length,
      ),
      lowestChecking: list.reduce(
        (low, s) => (s.lowestChecking < low ? s.lowestChecking : low),
        list[0]!.lowestChecking,
      ),
      transactions: list.reduce((n, s) => n + s.transactions, 0),
    };
  });
}

function table(header: string[], rows: string[][]): string[] {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i]!.length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!)))
      .join("  ");
  return [line(header), ...rows.map(line)];
}

export function formatPersonaTable(rows: readonly PersonaRow[]): string[] {
  return table(
    [
      "Persona",
      "People",
      "Income/mo",
      "Spending/mo",
      "Lowest checking",
      "Rows",
    ],
    rows.map((r) => [
      r.persona,
      String(r.people),
      formatCents(r.incomePerMonth, { whole: true }),
      formatCents(r.spendingPerMonth, { whole: true }),
      formatCents(r.lowestChecking, { whole: true }),
      String(r.transactions),
    ]),
  );
}

export function formatWarnings(warnings: readonly Warning[]): string[] {
  if (warnings.length === 0) return ["Checks: nothing to flag."];
  return [
    `Checks: ${warnings.length} to review (warnings only; the batch still loads)`,
    ...warnings.map((w) => `  ${w.person}: ${w.message}`),
  ];
}
