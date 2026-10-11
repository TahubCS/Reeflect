CREATE TABLE "insight_sample" (
	"batch_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"period_days" integer NOT NULL,
	"measure" text NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "insight_sample_workspace_id_period_days_measure_pk" PRIMARY KEY("workspace_id","period_days","measure")
);
--> statement-breakpoint
ALTER TABLE "insight_sample" ADD CONSTRAINT "insight_sample_batch_id_synthetic_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."synthetic_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_sample" ADD CONSTRAINT "insight_sample_workspace_id_organization_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_sample_batch_period_idx" ON "insight_sample" USING btree ("batch_id","period_days");