CREATE TABLE "planned_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"financial_account_id" text NOT NULL,
	"planned_on" date NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"category_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planned_transaction" ADD CONSTRAINT "planned_transaction_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_transaction" ADD CONSTRAINT "planned_transaction_financial_account_id_financial_account_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planned_transaction" ADD CONSTRAINT "planned_transaction_workspace_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."category"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planned_transaction_workspace_planned_idx" ON "planned_transaction" USING btree ("workspace_id","planned_on");--> statement-breakpoint
CREATE INDEX "planned_transaction_account_idx" ON "planned_transaction" USING btree ("financial_account_id");