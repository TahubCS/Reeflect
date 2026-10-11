CREATE UNIQUE INDEX "financial_account_workspace_id_uidx" ON "financial_account" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"merchant_normalized" text NOT NULL,
	"name" text NOT NULL,
	"decision" text DEFAULT 'candidate' NOT NULL,
	"kind" text NOT NULL,
	"amount_mode" text NOT NULL,
	"schedule_unit" text NOT NULL,
	"schedule_every" integer NOT NULL,
	"amount_cents" bigint,
	"baseline_amount_cents" bigint NOT NULL,
	"next_on" date,
	"manual" boolean DEFAULT false NOT NULL,
	"user_intent" text DEFAULT 'none' NOT NULL,
	"last_charged_on" date,
	"observed_amount_cents" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_schedule_check" CHECK ("recurring_series"."schedule_every" >= 1 AND (("recurring_series"."schedule_unit" = 'months' AND "recurring_series"."schedule_every" <= 36) OR ("recurring_series"."schedule_unit" = 'days' AND "recurring_series"."schedule_every" <= 730))),
	CONSTRAINT "recurring_amount_check" CHECK ("recurring_series"."baseline_amount_cents" > 0 AND "recurring_series"."baseline_amount_cents" <= 10000000000 AND ("recurring_series"."amount_cents" IS NULL OR ("recurring_series"."amount_cents" > 0 AND "recurring_series"."amount_cents" <= 10000000000))),
	CONSTRAINT "recurring_choice_check" CHECK ("recurring_series"."decision" IN ('candidate', 'confirmed', 'dismissed') AND "recurring_series"."kind" IN ('bill', 'subscription') AND "recurring_series"."amount_mode" IN ('fixed', 'variable') AND "recurring_series"."user_intent" IN ('none', 'keep', 'cancel')),
	CONSTRAINT "recurring_merchant_check" CHECK (char_length("recurring_series"."merchant_normalized") BETWEEN 1 AND 500 AND char_length("recurring_series"."name") BETWEEN 1 AND 80)
);
--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_workspace_account_fk" FOREIGN KEY ("workspace_id","financial_account_id") REFERENCES "public"."financial_account"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_workspace_idx" ON "recurring_series" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_workspace_account_merchant_uidx" ON "recurring_series" USING btree ("workspace_id","financial_account_id","merchant_normalized");
