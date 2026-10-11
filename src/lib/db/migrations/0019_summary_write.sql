CREATE TABLE "summary_write" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"written_on" date NOT NULL,
	"draft" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_write_draft_check" CHECK ("summary_write"."draft" is null or jsonb_typeof("summary_write"."draft") = 'object')
);
--> statement-breakpoint
ALTER TABLE "summary_write" ADD CONSTRAINT "summary_write_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "summary_write" ADD CONSTRAINT "summary_write_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "summary_write_user_day_idx" ON "summary_write" USING btree ("user_id","written_on");--> statement-breakpoint
CREATE INDEX "summary_write_workspace_day_idx" ON "summary_write" USING btree ("workspace_id","written_on","created_at");