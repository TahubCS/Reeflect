ALTER TABLE "import_batch" ALTER COLUMN "opening_balance_cents" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batch" ALTER COLUMN "closing_balance_cents" DROP NOT NULL;