// Synthetic statements for the PDF import tests (TEST-08). Every name,
// number and transaction here is made up. The layout copies Capital One's
// public sample 360 eStatement; `generate.ts` draws these into the PDFs
// beside this file, and the tests compare what the parser reads with them.

export type FixtureRow = {
  description: string;
  /** MM/DD/YYYY, as the statement prints it. */
  date: string;
  /** Signed cents from the account holder's point of view. */
  amount: number;
};

export type FixtureAccount = {
  product: string;
  number: string;
  openingDate: string;
  closingDate: string;
  opening: number;
  rows: FixtureRow[];
  /** Added to the true closing balance, to break reconciliation. */
  closingError?: number;
  /** Print money out without a minus sign, as some statements do. */
  unsignedDebits?: boolean;
};

export type FixtureStatement = {
  file: string;
  bank: "capital-one" | "other";
  holder: string;
  asOf: string;
  accounts: FixtureAccount[];
};

const checkingRows: FixtureRow[] = [
  {
    description: "Payroll Deposit SAMPLE CO",
    date: "09/01/2026",
    amount: 145000,
  },
  {
    description: "Debit Card Purchase CORNER MARKET #0042",
    date: "09/02/2026",
    amount: -6412,
  },
  {
    description: "Debit Card Purchase DAILY GRIND",
    date: "09/02/2026",
    amount: -575,
  },
  {
    description: "Debit Card Purchase DAILY GRIND",
    date: "09/02/2026",
    amount: -575,
  },
  { description: "Rent Payment, Unit 4B", date: "09/03/2026", amount: -120000 },
  { description: 'Zelle from "Sam"', date: "09/05/2026", amount: 2500 },
  { description: "ATM Withdrawal", date: "09/08/2026", amount: -6000 },
  {
    description: "Debit Card Purchase STREAMING SVC",
    date: "09/09/2026",
    amount: -1549,
  },
  {
    description: "Payroll Deposit SAMPLE CO",
    date: "09/15/2026",
    amount: 145000,
  },
  {
    description: "Debit Card Purchase GAS STATION 118",
    date: "09/18/2026",
    amount: -3800,
  },
  { description: "Monthly Interest Paid", date: "09/30/2026", amount: 12 },
];

function manyRows(count: number): FixtureRow[] {
  const merchants = [
    "CORNER MARKET",
    "DAILY GRIND",
    "NOODLE BAR",
    "GAS STATION",
    "BOOK NOOK",
  ];
  return Array.from({ length: count }, (_, index) => {
    const day = String(1 + Math.floor((index * 30) / count)).padStart(2, "0");
    return index % 10 === 0
      ? {
          description: "Transfer from 360 Savings",
          date: `09/${day}/2026`,
          amount: 20000,
        }
      : {
          description: `Debit Card Purchase ${merchants[index % merchants.length]}`,
          date: `09/${day}/2026`,
          amount: -(250 + ((index * 137) % 4000)),
        };
  });
}

const savingsInterest: FixtureAccount = {
  product: "360 Savings",
  number: "77015678",
  openingDate: "09/01/2026",
  closingDate: "09/30/2026",
  opening: 518693,
  rows: [
    { description: "Monthly Interest Paid", date: "09/30/2026", amount: 1065 },
  ],
};

const checking: FixtureAccount = {
  product: "360 Checking",
  number: "40021234",
  openingDate: "09/01/2026",
  closingDate: "09/30/2026",
  opening: 194000,
  rows: checkingRows,
};

export const FIXTURES: FixtureStatement[] = [
  {
    file: "capital-one-normal.pdf",
    bank: "capital-one",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [checking],
  },
  {
    file: "capital-one-empty.pdf",
    bank: "capital-one",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [{ ...savingsInterest, rows: [] }],
  },
  {
    file: "capital-one-multipage.pdf",
    bank: "capital-one",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [{ ...checking, rows: manyRows(90) }, savingsInterest],
  },
  {
    file: "capital-one-off-by-a-cent.pdf",
    bank: "capital-one",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [{ ...checking, closingError: 1 }],
  },
  {
    file: "capital-one-unsigned-debits.pdf",
    bank: "capital-one",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [{ ...checking, unsignedDebits: true }],
  },
  {
    file: "other-bank.pdf",
    bank: "other",
    holder: "Alex Sample",
    asOf: "09/30/2026",
    accounts: [checking],
  },
];

export function closingBalance(account: FixtureAccount): number {
  return (
    account.opening +
    account.rows.reduce((total, row) => total + row.amount, 0) +
    (account.closingError ?? 0)
  );
}
