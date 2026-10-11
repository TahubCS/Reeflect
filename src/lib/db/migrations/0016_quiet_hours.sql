CREATE TABLE "notification_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"quiet_start_minute" smallint NOT NULL,
	"quiet_end_minute" smallint NOT NULL,
	"previous_start_minute" smallint,
	"previous_end_minute" smallint,
	"changed_by_text_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_setting_quiet_hours_check" CHECK ("notification_setting"."quiet_start_minute" between 0 and 1439 and "notification_setting"."quiet_end_minute" between 0 and 1439 and "notification_setting"."quiet_start_minute" <> "notification_setting"."quiet_end_minute")
);
--> statement-breakpoint
ALTER TABLE "notification_setting" ADD CONSTRAINT "notification_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;