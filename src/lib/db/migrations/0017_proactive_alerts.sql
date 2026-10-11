CREATE TABLE "proactive_message" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"kind" text NOT NULL,
	"subject_key" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proactive_message_values_check" CHECK ("proactive_message"."kind" in ('subscription_alert', 'bill_reminder') and "proactive_message"."status" in ('queued', 'sent', 'cancelled', 'failed') and "proactive_message"."attempts" >= 0 and char_length("proactive_message"."subject_key") between 1 and 1200)
);
--> statement-breakpoint
ALTER TABLE "notification_setting" ADD COLUMN "subscription_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_setting" ADD COLUMN "bill_reminders" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "proactive_message" ADD CONSTRAINT "proactive_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_message" ADD CONSTRAINT "proactive_message_identity_id_messaging_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."messaging_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_message" ADD CONSTRAINT "proactive_message_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proactive_message_subject_uidx" ON "proactive_message" USING btree ("workspace_id","kind","subject_key");--> statement-breakpoint
CREATE INDEX "proactive_message_due_idx" ON "proactive_message" USING btree ("status","not_before");--> statement-breakpoint
CREATE INDEX "proactive_message_identity_sent_idx" ON "proactive_message" USING btree ("identity_id","sent_at");