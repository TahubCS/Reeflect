import { describe, expect, it, vi } from "vitest";
import { extractPdfText } from "./extract-pdf";

// The PDF library's failures, which the synthetic fixtures can't produce:
// pdf-lib cannot write an encrypted PDF or a 51-page one cheaply.
const getDocumentProxy = vi.hoisted(() => vi.fn());
vi.mock("unpdf", () => ({ getDocumentProxy }));

const bytes = new TextEncoder().encode("%PDF-1.7");
const destroy = vi.fn();

describe("extractPdfText failures", () => {
  it("reports a password-protected PDF", async () => {
    getDocumentProxy.mockRejectedValueOnce(
      Object.assign(new Error("No password given"), {
        name: "PasswordException",
      }),
    );
    expect(await extractPdfText(bytes)).toEqual({
      ok: false,
      problem: "encrypted",
    });
  });

  it("reports more than 50 pages without reading them", async () => {
    const getPage = vi.fn();
    getDocumentProxy.mockResolvedValueOnce({
      numPages: 51,
      getPage,
      loadingTask: { destroy },
    });
    expect(await extractPdfText(bytes)).toEqual({
      ok: false,
      problem: "too-many-pages",
    });
    expect(getPage).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it("reports a page that fails to read", async () => {
    getDocumentProxy.mockResolvedValueOnce({
      numPages: 1,
      getPage: () => Promise.reject(new Error("bad page")),
      loadingTask: { destroy },
    });
    expect(await extractPdfText(bytes)).toEqual({
      ok: false,
      problem: "unreadable",
    });
  });

  it("ignores marked-content items that carry no text", async () => {
    getDocumentProxy.mockResolvedValueOnce({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({
          items: [
            { type: "beginMarkedContent" },
            { str: "x".repeat(50), transform: [1, 0, 0, 1, 10.4, 20.6] },
          ],
        }),
      }),
      loadingTask: { destroy },
    });
    expect(await extractPdfText(bytes)).toEqual({
      ok: true,
      pages: 1,
      items: [{ page: 1, x: 10, y: 21, text: "x".repeat(50) }],
    });
  });
});
