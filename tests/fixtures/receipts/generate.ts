// Draws the made-up receipts in `specs.ts` as PNGs beside this file
// (TEST-08, ADR-067). Run after changing a spec, and commit the PNGs:
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
//     --import ./scripts/register-paths.ts tests/fixtures/receipts/generate.ts
//
// Each receipt is a small HTML page photographed with Playwright's Chromium,
// which is already installed for the end-to-end tests. Fonts differ between
// machines, so the bytes may too; what is printed does not.
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { RECEIPTS, type ReceiptLine, type ReceiptSpec } from "./specs";

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const row = (line: ReceiptLine, strong = false) =>
  `<div class="row${strong ? " strong" : ""}"><span>${escape(line.label)}</span><span>${escape(line.amount)}</span></div>`;

function page(spec: ReceiptSpec): string {
  const last = spec.totals.length - 1;
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<style>
  body { margin: 0; background: #fff; }
  main { width: 300px; padding: 24px 20px; font: 14px/1.5 "Courier New", monospace; color: #111; }
  h1 { font-size: 18px; text-align: center; margin: 0; }
  p { text-align: center; margin: 0 0 12px; font-size: 12px; }
  .row { display: flex; justify-content: space-between; }
  .strong { font-weight: 700; font-size: 16px; }
  hr { border: 0; border-top: 1px dashed #111; margin: 10px 0; }
  footer { text-align: center; font-size: 12px; margin-top: 12px; }
</style>
<main>
  ${spec.merchant === null ? "" : `<h1>${escape(spec.merchant)}</h1>`}
  <p>${escape(spec.address)}</p>
  ${spec.items.map((line) => row(line)).join("\n  ")}
  ${spec.totals.length > 0 ? "<hr>" : ""}
  ${spec.totals.map((line, index) => row(line, index === last)).join("\n  ")}
  <footer>${spec.footer.map((line) => `<div>${escape(line)}</div>`).join("")}</footer>
</main>
</html>`;
}

const browser = await chromium.launch();
try {
  const tab = await browser.newPage({
    viewport: { width: 340, height: 200 },
    deviceScaleFactor: 2,
  });
  for (const spec of RECEIPTS) {
    await tab.setContent(page(spec));
    const path = fileURLToPath(new URL(`./${spec.name}.png`, import.meta.url));
    await tab.locator("main").screenshot({ path });
    console.log(`wrote ${spec.name}.png`);
  }
} finally {
  await browser.close();
}
