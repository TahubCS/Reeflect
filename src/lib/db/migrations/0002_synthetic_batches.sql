CREATE TABLE "financial_account" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"institution_name" text NOT NULL,
	"type" text NOT NULL,
	"mask_last4" text,
	"nickname" text NOT NULL,
	"source" text NOT NULL,
	"current_balance_cents" bigint DEFAULT 0 NOT NULL,
	"balance_as_of" date,
	"identity_confirmed_at" timestamp with time zone,
	"plaid_account_id" text,
	"nessie_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"posted_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description_raw" text NOT NULL,
	"merchant_normalized" text,
	"status" text DEFAULT 'posted' NOT NULL,
	"is_transfer" boolean DEFAULT false NOT NULL,
	"transfer_pair_id" text,
	"source" text NOT NULL,
	"external_id" text,
	"fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthetic_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"generator_version" integer NOT NULL,
	"seed" text NOT NULL,
	"start_month" text NOT NULL,
	"months" integer NOT NULL,
	"as_of" date NOT NULL,
	"spec" jsonb NOT NULL,
	"notes" text,
	"created_by" text,
	"promoted_from" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synthetic_workspace" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"person_key" text NOT NULL,
	"persona" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_account" ADD CONSTRAINT "financial_account_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_financial_account_id_financial_account_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_workspace" ADD CONSTRAINT "synthetic_workspace_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "synthetic_workspace" ADD CONSTRAINT "synthetic_workspace_batch_id_synthetic_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."synthetic_batch"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "financial_account_workspace_idx" ON "financial_account" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_account_plaid_uidx" ON "financial_account" USING btree ("workspace_id","plaid_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_account_nessie_uidx" ON "financial_account" USING btree ("workspace_id","nessie_account_id");--> statement-breakpoint
CREATE INDEX "transaction_workspace_idx" ON "transaction" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "transaction_workspace_posted_idx" ON "transaction" USING btree ("workspace_id","posted_on");--> statement-breakpoint
CREATE INDEX "transaction_account_posted_idx" ON "transaction" USING btree ("financial_account_id","posted_on");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_account_fingerprint_uidx" ON "transaction" USING btree ("financial_account_id","fingerprint");--> statement-breakpoint
CREATE INDEX "synthetic_workspace_batch_idx" ON "synthetic_workspace" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "synthetic_workspace_person_uidx" ON "synthetic_workspace" USING btree ("batch_id","person_key");