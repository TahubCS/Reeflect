CREATE TABLE "budget" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"category_id" text NOT NULL,
	"month" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_month_check" CHECK ("budget"."month" ~ '^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'),
	CONSTRAINT "budget_amount_check" CHECK ("budget"."amount_cents" >= 0 AND "budget"."amount_cents" <= 10000000000)
);
--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_workspace_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."category"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budget_workspace_month_category_uidx" ON "budget" USING btree ("workspace_id","month","category_id");