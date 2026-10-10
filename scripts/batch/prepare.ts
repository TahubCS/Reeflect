// Everything `batch load` does before touching a database: validate the
// spec, fix its asOf date, expand it and run the plausibility checks.
import {
  type Expansion,
  GENERATOR_VERSION,
  type Spec,
  type Warning,
  checkExpansion,
  checkSpec,
  expandSpec,
  parseSpec,
} from "@/features/synthetic";
import type { syntheticBatch } from "@/lib/db/schema";

export type PreparedBatch = {
  spec: Spec;
  expansion: Expansion;
  warnings: Warning[];
  batch: Omit<typeof syntheticBatch.$inferInsert, "id">;
};

export type PrepareOptions = {
  seed: string;
  /** Used when the spec has no asOf: normally today. */
  today: string;
  label?: string;
  notes?: string;
  createdBy?: string | null;
  promotedFrom?: string | null;
};

// No parameter properties: Node's type stripping does not support them.
export class SpecError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`The spec is not valid:\n  ${problems.join("\n  ")}`);
    this.problems = problems;
  }
}

export function prepareBatch(
  input: unknown,
  options: PrepareOptions,
): PreparedBatch {
  const parsed = parseSpec(input);
  if (!parsed.ok) throw new SpecError(parsed.problems);
  // Store asOf in the spec itself, so replaying the batch later (or into
  // production) stops on the same day.
  const spec: Spec = {
    ...parsed.spec,
    asOf: parsed.spec.asOf ?? options.today,
  };
  if (spec.asOf! < `${spec.startMonth}-01`) {
    throw new SpecError([`asOf: ${spec.asOf} is before the span starts`]);
  }
  const expansion = expandSpec(spec, { seed: options.seed });
  return {
    spec,
    expansion,
    warnings: [...checkSpec(spec), ...checkExpansion(expansion)],
    batch: {
      label: options.label ?? spec.label,
      generatorVersion: GENERATOR_VERSION,
      seed: options.seed,
      startMonth: spec.startMonth,
      months: spec.months,
      asOf: spec.asOf!,
      spec,
      notes: options.notes ?? null,
      createdBy: options.createdBy ?? null,
      promotedFrom: options.promotedFrom ?? null,
    },
  };
}
