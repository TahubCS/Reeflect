// Opt-in timing measurement; unit tests enforce once-per-list validation and
// category correctness without a machine-dependent wall-clock deadline.
import { performance } from "node:perf_hooks";
import {
  PRESET_CATEGORIES,
  classifyStored,
  withStarterRules,
} from "@/features/categorization/client";

const rules = withStarterRules(
  [
    {
      id: "rule-1",
      categoryId: "category-shopping",
      pattern: "coffee beans",
      matchType: "contains",
      priority: 5,
    },
  ],
  PRESET_CATEGORIES.map((preset) => ({
    id: `category-${preset.key}`,
    presetKey: preset.key,
  })),
);
const row = {
  descriptionRaw: "Market",
  categoryId: null,
  categoryIsManual: false,
};
const rowsPerBatch = 20_000;

function classifyBatch(): void {
  for (let i = 0; i < rowsPerBatch; i += 1) classifyStored(row, rules);
}

classifyBatch(); // Warm up compilation and JIT before measuring.
const samplesMs = Array.from({ length: 5 }, () => {
  const start = performance.now();
  classifyBatch();
  return performance.now() - start;
});
console.log(
  JSON.stringify({ rowsPerBatch, ruleCount: rules.length, samplesMs }, null, 2),
);
