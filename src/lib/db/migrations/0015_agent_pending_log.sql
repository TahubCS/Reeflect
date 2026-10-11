CREATE TABLE "agent_pending_log" (
	"identity_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"description" text NOT NULL,
	"day" text NOT NULL,
	"account_ids" text[] NOT NULL,
	"asked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_pending_log" ADD CONSTRAINT "agent_pending_log_identity_id_messaging_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."messaging_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pending_log" ADD CONSTRAINT "agent_pending_log_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;