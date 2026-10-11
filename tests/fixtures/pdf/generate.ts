// Draws the synthetic statements in `specs.ts` into PDFs beside this file
// (TEST-08). Run after changing a spec, and commit the PDFs:
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
//     --import ./scripts/register-paths.ts tests/fixtures/pdf/generate.ts
//
// Positions follow Capital One's sample 360 eStatement (US Letter, points
// from the bottom left), so the parser meets the real layout. Dates in the
// PDF metadata are fixed, so the same spec always gives the same bytes.
import { writeFileSync } from "node:fs";
import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { absolute, cents, formatCents } from "@/lib/money";
import {
  FIXTURES,
  type FixtureAccount,
  type FixtureStatement,
  closingBalance,
} from "./specs";

const PAGE: [number, number] = [612, 792];
const ROW = 13;
const BOTTOM = 90;
const FIXED_DATE = new Date("2026-10-01T00:00:00Z");

const money = (amount: number) => formatCents(cents(amount));

type Pen = { doc: PDFDocument; font: PDFFont; page: PDFPage; y: number };

function text(pen: Pen, x: number, value: string, size = 9) {
  pen.page.drawText(value, { x, y: pen.y, size, font: pen.font });
}

function footer(pen: Pen, bank: FixtureStatement["bank"]) {
  const site =
    bank === "capital-one" ? "capitalone360.com" : "examplebank.test";
  pen.page.drawText(`${site}   Interactive Phone Service: 1-800-555-0100`, {
    x: 36,
    y: 23,
    size: 7,
    font: pen.font,
  });
}

function newPage(pen: Pen, bank: FixtureStatement["bank"]) {
  pen.page = pen.doc.addPage(PAGE);
  pen.y = 740;
  footer(pen, bank);
}

function header(pen: Pen) {
  text(pen, 54, "Activity");
  text(pen, 374, "Date");
  text(pen, 457, "Amount");
  text(pen, 531, "Balance");
  pen.y -= 24;
}

function line(pen: Pen, bank: FixtureStatement["bank"]) {
  pen.y -= ROW;
  if (pen.y < BOTTOM) {
    newPage(pen, bank);
    header(pen);
  }
}

function activity(
  pen: Pen,
  account: FixtureAccount,
  bank: FixtureStatement["bank"],
) {
  if (pen.y < BOTTOM + 6 * ROW) newPage(pen, bank);
  text(pen, 65, `Your ${account.product} Activity`, 12);
  pen.y -= 22;
  text(
    pen,
    54,
    `Account: ${account.number} Current Interest Rate: 2.467% Annual Percentage Yield Earned: 2.49%`,
    7,
  );
  pen.y -= 31;
  header(pen);

  text(pen, 55, "Opening Balance");
  text(pen, 361, account.openingDate);
  text(pen, 521, money(account.opening));
  let balance = account.opening;
  for (const row of account.rows) {
    line(pen, bank);
    balance += row.amount;
    const printed =
      account.unsignedDebits && row.amount < 0
        ? formatCents(absolute(cents(row.amount)))
        : money(row.amount);
    text(pen, 55, row.description);
    text(pen, 361, row.date);
    text(pen, 461, printed);
    text(pen, 521, money(balance));
  }
  line(pen, bank);
  text(pen, 55, "Closing Balance");
  text(pen, 361, account.closingDate);
  text(pen, 521, money(closingBalance(account)));
  pen.y -= 40;
}

async function statement(spec: FixtureStatement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer("Reeflect test fixtures");
  doc.setCreator("tests/fixtures/pdf/generate.ts");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pen: Pen = { doc, font, page: doc.addPage(PAGE), y: 646 };
  footer(pen, spec.bank);

  text(pen, 59, spec.holder);
  text(
    pen,
    344,
    spec.bank === "capital-one"
      ? "Thanks for saving with Capital One 360"
      : "Thanks for banking with First Example Bank",
  );
  pen.y -= 12;
  text(pen, 59, "100 Sample Street");
  pen.y -= 12;
  text(pen, 59, "Anywhere, US 00000");

  pen.y = 429;
  text(pen, 64, "Your Savings Summary", 11);
  text(pen, 187, `as of ${spec.asOf}`);
  pen.y -= 21;
  text(pen, 63, "Account Type");
  text(pen, 311, "Account Number");
  text(pen, 373, "Account Balance");
  for (const account of spec.accounts) {
    pen.y -= 12;
    text(pen, 55, account.product);
    text(pen, 323, account.number);
    text(pen, 382, money(closingBalance(account)));
  }
  pen.y = 355;
  for (const account of spec.accounts) activity(pen, account, spec.bank);
  return doc.save({ useObjectStreams: false });
}

/** A page with shapes and no text layer, like a scanned statement. */
async function imageOnly(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  const page = doc.addPage(PAGE);
  for (let y = 700; y > 100; y -= 14) {
    page.drawRectangle({
      x: 54,
      y,
      width: 480,
      height: 6,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
  return doc.save();
}

const directory = new URL("./", import.meta.url);
for (const spec of FIXTURES) {
  writeFileSync(new URL(spec.file, directory), await statement(spec));
}
writeFileSync(new URL("image-only.pdf", directory), await imageOnly());
console.log(`Wrote ${FIXTURES.length + 1} fixture PDFs.`);
