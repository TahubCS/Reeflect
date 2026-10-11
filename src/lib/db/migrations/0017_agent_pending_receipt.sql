ALTER TABLE "agent_pending_log" ADD COLUMN "kind" text DEFAULT 'account' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_pending_log" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "agent_pending_log" ADD COLUMN "message_id" text;--> statement-breakpoint
ALTER TABLE "agent_pending_log" ADD CONSTRAINT "agent_pending_log_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;