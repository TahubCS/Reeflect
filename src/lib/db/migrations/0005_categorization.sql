CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"color_token" text DEFAULT 'bar' NOT NULL,
	"sort_order" integer NOT NULL,
	"is_preset" boolean DEFAULT true NOT NULL,
	"preset_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"pattern" text NOT NULL,
	"match_type" text NOT NULL,
	"category_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "category_is_manual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rule" ADD CONSTRAINT "category_rule_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_workspace_id_uidx" ON "category" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_workspace_preset_uidx" ON "category" USING btree ("workspace_id","preset_key");--> statement-breakpoint
CREATE INDEX "category_rule_workspace_idx" ON "category_rule" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "category_rule" ADD CONSTRAINT "category_rule_workspace_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."category"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_workspace_category_fk" FOREIGN KEY ("workspace_id","category_id") REFERENCES "public"."category"("workspace_id","id") ON DELETE no action ON UPDATE no action;
