CREATE TABLE "agent_link_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_link_code" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"platform" text,
	"handle" text,
	"space_id" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_link_code_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "messaging_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"platform" text NOT NULL,
	"handle" text NOT NULL,
	"space_id" text NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"proactive_opt_in" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_link_code" ADD CONSTRAINT "agent_link_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_identity" ADD CONSTRAINT "messaging_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_identity" ADD CONSTRAINT "messaging_identity_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_link_attempt_handle_idx" ON "agent_link_attempt" USING btree ("platform","handle","attempted_at");--> statement-breakpoint
CREATE INDEX "agent_link_code_user_idx" ON "agent_link_code" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messaging_identity_workspace_idx" ON "messaging_identity" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_identity_active_handle_uidx" ON "messaging_identity" USING btree ("platform","handle") WHERE "messaging_identity"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_identity_active_user_uidx" ON "messaging_identity" USING btree ("user_id") WHERE "messaging_identity"."revoked_at" is null;