import "server-only";
import { getDocumentProxy } from "unpdf";
import type { TextItem } from "../domain/text";
import {
  type FileProblem,
  MAX_PDF_PAGES,
  checkExtracted,
} from "../domain/validate-file";

// Reads a PDF's text layer with positions (ADR-044 step 2). The bytes stay
// in memory: nothing is written to disk or storage, and the caller drops
// them once this returns (ADR-025).

export type Extraction =
  | { ok: true; pages: number; items: TextItem[] }
  | { ok: false; problem: FileProblem };

export async function extractPdfText(bytes: Uint8Array): Promise<Extraction> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    // pdf.js may take over the buffer it is given, so it gets a copy.
    pdf = await getDocumentProxy(bytes.slice());
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return {
      ok: false,
      problem: name === "PasswordException" ? "encrypted" : "unreadable",
    };
  }
  try {
    if (pdf.numPages > MAX_PDF_PAGES)
      return { ok: false, problem: "too-many-pages" };
    const items: TextItem[] = [];
    let characters = 0;
    for (let page = 1; page <= pdf.numPages; page += 1) {
      const content = await (await pdf.getPage(page)).getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || item.str.trim() === "") continue;
        characters += item.str.trim().length;
        items.push({
          page,
          x: Math.round(item.transform[4] as number),
          y: Math.round(item.transform[5] as number),
          text: item.str,
        });
      }
    }
    const problem = checkExtracted(pdf.numPages, characters);
    return problem
      ? { ok: false, problem }
      : { ok: true, pages: pdf.numPages, items };
  } catch {
    return { ok: false, problem: "unreadable" };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
