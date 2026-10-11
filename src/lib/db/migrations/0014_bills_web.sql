CREATE TABLE "bill_cycle" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"bill_id" text NOT NULL,
	"scheduled_on" date NOT NULL,
	"due_on" date NOT NULL,
	"date_source" text NOT NULL,
	"invoice_cents" bigint,
	"estimate_cents" bigint NOT NULL,
	"marked_paid" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_cycle_values_check" CHECK ("bill_cycle"."revision" > 0 AND "bill_cycle"."date_source" IN ('user', 'predicted') AND "bill_cycle"."estimate_cents" >= 0 AND "bill_cycle"."estimate_cents" <= 10000000000 AND ("bill_cycle"."invoice_cents" IS NULL OR ("bill_cycle"."invoice_cents" >= 0 AND "bill_cycle"."invoice_cents" <= 10000000000)))
);
--> statement-breakpoint
CREATE TABLE "bill_details" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"anchor_on" date NOT NULL,
	"date_source" text NOT NULL,
	"autopay" boolean DEFAULT false NOT NULL,
	"liability_account_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_details_values_check" CHECK ("bill_details"."revision" > 0 AND "bill_details"."date_source" IN ('user', 'predicted'))
);
--> statement-breakpoint
CREATE TABLE "bill_payment" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"evidence_workspace_id" text,
	"transaction_id" text,
	"original_transaction_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"posted_on" date NOT NULL,
	"description" text NOT NULL,
	"is_transfer" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_payment_values_check" CHECK ("bill_payment"."amount_cents" > 0 AND "bill_payment"."amount_cents" <= 10000000000 AND (("bill_payment"."evidence_workspace_id" IS NULL AND "bill_payment"."transaction_id" IS NULL) OR ("bill_payment"."evidence_workspace_id" IS NOT NULL AND "bill_payment"."transaction_id" IS NOT NULL AND "bill_payment"."evidence_workspace_id" = "bill_payment"."workspace_id" AND "bill_payment"."transaction_id" = "bill_payment"."original_transaction_id")))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_cycle_workspace_id_uidx" ON "bill_cycle" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_cycle_identity_uidx" ON "bill_cycle" USING btree ("workspace_id","bill_id","scheduled_on");
--> statement-breakpoint
CREATE INDEX "bill_cycle_workspace_due_idx" ON "bill_cycle" USING btree ("workspace_id","due_on");
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_details_workspace_id_uidx" ON "bill_details" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_details_series_uidx" ON "bill_details" USING btree ("workspace_id","financial_account_id","merchant_normalized");
--> statement-breakpoint
CREATE INDEX "bill_payment_cycle_idx" ON "bill_payment" USING btree ("workspace_id","cycle_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "bill_payment_allocation_uidx" ON "bill_payment" USING btree ("workspace_id","original_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_workspace_id_uidx" ON "transaction" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "bill_cycle" ADD CONSTRAINT "bill_cycle_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_cycle" ADD CONSTRAINT "bill_cycle_bill_fk" FOREIGN KEY ("workspace_id","bill_id") REFERENCES "public"."bill_details"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_details" ADD CONSTRAINT "bill_details_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_details" ADD CONSTRAINT "bill_details_series_fk" FOREIGN KEY ("workspace_id","financial_account_id","merchant_normalized") REFERENCES "public"."recurring_series"("workspace_id","financial_account_id","merchant_normalized") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_details" ADD CONSTRAINT "bill_details_liability_fk" FOREIGN KEY ("workspace_id","liability_account_id") REFERENCES "public"."financial_account"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_cycle_fk" FOREIGN KEY ("workspace_id","cycle_id") REFERENCES "public"."bill_cycle"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_account_fk" FOREIGN KEY ("workspace_id","financial_account_id") REFERENCES "public"."financial_account"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bill_payment" ADD CONSTRAINT "bill_payment_evidence_fk" FOREIGN KEY ("evidence_workspace_id","transaction_id") REFERENCES "public"."transaction"("workspace_id","id") ON DELETE set null ON UPDATE no action;
