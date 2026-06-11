ALTER TYPE "public"."weather_condition" ADD VALUE 'TEMPERATURE_RANGE' BEFORE 'PRECIPITATION';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"forecasted_at" timestamp with time zone NOT NULL,
	"target_date" date NOT NULL,
	"temp_max_c" double precision NOT NULL,
	"temp_max_f" double precision NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "polymarket_markets" ADD COLUMN "parsed_threshold_high" double precision;--> statement-breakpoint
ALTER TABLE "polymarket_markets" ADD COLUMN "parsed_target_date" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_forecasts" ADD CONSTRAINT "daily_forecasts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "daily_forecasts_loc_date_provider_idx" ON "daily_forecasts" USING btree ("location_id","target_date","provider","forecasted_at" DESC NULLS LAST);