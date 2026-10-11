CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_by" text,
	"file_sha256" text,
	"statement_institution" text NOT NULL,
	"statement_last4" text NOT NULL,
	"product_name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"opening_balance_cents" bigint NOT NULL,
	"closing_balance_cents" bigint NOT NULL,
	"reconciliation" text NOT NULL,
	"rows_parsed" integer NOT NULL,
	"rows_imported" integer DEFAULT 0 NOT NULL,
	"rows_skipped_duplicate" integer DEFAULT 0 NOT NULL,
	"checks" jsonb NOT NULL,
	"csv_object_key" text NOT NULL,
	"csv_sha256" text NOT NULL,
	"status" text NOT NULL,
	"committed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "import_batch_id" text;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_financial_account_id_financial_account_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_batch_workspace_idx" ON "import_batch" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batch_account_file_uidx" ON "import_batch" USING btree ("financial_account_id","file_sha256");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE set null ON UPDATE no action;