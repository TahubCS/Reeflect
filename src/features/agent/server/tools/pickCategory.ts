import "server-only";
import { type AiRequest, generateText } from "@/lib/ai/client";
import {
  type CategoryChoice,
  categoryRequest,
  matchCategory,
} from "../../domain/category-pick";

/**
 * A category for `description` from a model, or null (F-27, ADR-063). Never
 * throws: with no key, no answer, or an answer that is not on the list, the
 * purchase simply stays uncategorized.
 */
export async function pickCategory(
  description: string,
  categories: readonly CategoryChoice[],
  generate: (request: AiRequest) => Promise<string> = generateText,
): Promise<CategoryChoice | null> {
  if (categories.length === 0) return null;
  try {
    return matchCategory(
      await generate(categoryRequest(description, categories)),
      categories,
    );
  } catch (error) {
    console.warn("agent: no category picked", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }
}
