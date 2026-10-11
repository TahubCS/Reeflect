// Turns the PDF's positioned text into lines a template can read. The PDF
// text layer gives each run of text with its page and x/y position; runs
// whose baselines are within `tolerance` points sit on the same line.

export type TextItem = { page: number; x: number; y: number; text: string };

export type Cell = { x: number; text: string };

export type Line = { page: number; y: number; cells: Cell[]; text: string };

export function toLines(items: readonly TextItem[], tolerance = 2): Line[] {
  const sorted = items
    .filter((item) => item.text.trim() !== "")
    .toSorted((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const item of sorted) {
    const last = lines.at(-1);
    const cell = { x: item.x, text: item.text.trim() };
    if (last && last.page === item.page && last.y - item.y <= tolerance) {
      last.cells.push(cell);
    } else {
      lines.push({ page: item.page, y: item.y, cells: [cell], text: "" });
    }
  }
  for (const line of lines) {
    line.cells.sort((a, b) => a.x - b.x);
    line.text = line.cells.map((cell) => cell.text).join(" ");
  }
  return lines;
}
