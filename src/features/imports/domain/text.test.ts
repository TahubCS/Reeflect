import { describe, expect, it } from "vitest";
import { toLines } from "./text";

describe("toLines", () => {
  it("groups runs on one baseline into a line, left to right, top to bottom", () => {
    const lines = toLines([
      { page: 1, x: 300, y: 500, text: "$2.49" },
      { page: 1, x: 50, y: 501, text: "Interest" },
      { page: 1, x: 50, y: 700, text: "Title" },
      { page: 2, x: 50, y: 700, text: "Next page" },
      { page: 1, x: 50, y: 480, text: "  " },
    ]);
    expect(lines.map((line) => [line.page, line.text])).toEqual([
      [1, "Title"],
      [1, "Interest $2.49"],
      [2, "Next page"],
    ]);
    expect(lines[1]!.cells.map((cell) => cell.x)).toEqual([50, 300]);
  });

  it("keeps baselines further apart than the tolerance on separate lines", () => {
    const lines = toLines(
      [
        { page: 1, x: 0, y: 100, text: "a" },
        { page: 1, x: 0, y: 96, text: "b" },
      ],
      2,
    );
    expect(lines).toHaveLength(2);
  });
});
