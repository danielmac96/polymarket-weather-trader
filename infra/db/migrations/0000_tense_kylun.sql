CREATE TYPE "public"."decision" AS ENUM('TRADE', 'WATCH', 'SKIP');--> statement-breakpoint
CREATE TYPE "public"."market_side" AS ENUM('YES', 'NO');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('ACTIVE', 'CLOSED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."region" AS ENUM('US', 'UK', 'AU', 'CA');--> statement-breakpoint
CREATE TYPE "public"."threshold_unit" AS ENUM('F', 'C', 'in', 'mm', 'mph');--> statement-breakpoint
CREATE TYPE "public"."trade_source" AS ENUM('AUTO', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('OPEN', 'CLOSED_MANUAL', 'RESOLVED_WIN', 'RESOLVED_LOSS');--> statement-breakpoint
CREATE TYPE "public"."weather_condition" AS ENUM('TEMPERATURE_ABOVE', 'TEMPERATURE_BELOW', 'PRECIPITATION', 'SNOW', 'WIND', 'HURRICANE');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" "region" NOT NULL,
	"name" text NOT NULL,
	"state" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"implied_prob" double precision NOT NULL,
	"model_prob" double precision NOT NULL,
	"edge" double precision NOT NULL,
	"confidence" double precision NOT NULL,
	"decision" "decision" NOT NULL,
	"reasoning" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"token_id" text NOT NULL,
	"side" "market_side" NOT NULL,
	"price" double precision NOT NULL,
	"best_bid" double precision,
	"best_ask" double precision,
	"midpoint" double precision,
	"volume_24hr" double precision,
	"liquidity" double precision,
	"at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paper_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"analysis_id" uuid,
	"side" "market_side" NOT NULL,
	"entry_price" double precision NOT NULL,
	"size_usd" double precision NOT NULL,
	"shares_qty" double precision NOT NULL,
	"status" "trade_status" DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"close_price" double precision,
	"realized_pnl_usd" double precision,
	"source" "trade_source" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "polymarket_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" text NOT NULL,
	"question" text NOT NULL,
	"end_date" timestamp with time zone,
	"clob_token_id_yes" text,
	"clob_token_id_no" text,
	"region" "region",
	"parsed_location_id" uuid,
	"parsed_condition" "weather_condition",
	"parsed_threshold" double precision,
	"parsed_threshold_unit" "threshold_unit",
	"status" "market_status" DEFAULT 'ACTIVE' NOT NULL,
	"resolved_outcome" "market_side",
	"resolved_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polymarket_markets_market_id_unique" UNIQUE("market_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"cash_usd" double precision NOT NULL,
	"open_positions_count" integer NOT NULL,
	"open_exposure_usd" double precision NOT NULL,
	"unrealized_pnl_usd" double precision NOT NULL,
	"realized_pnl_usd_to_date" double precision NOT NULL,
	"total_equity_usd" double precision NOT NULL,
	"roi_pct" double precision NOT NULL,
	"win_rate_pct" double precision NOT NULL,
	"total_trades_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weather_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"forecasted_at" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"temp_c" double precision,
	"temp_f" double precision,
	"precip_mm" double precision,
	"precip_prob" double precision,
	"wind_kph" double precision,
	"weather_code" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_analysis" ADD CONSTRAINT "market_analysis_market_id_polymarket_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."polymarket_markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "market_prices" ADD CONSTRAINT "market_prices_market_id_polymarket_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."polymarket_markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_market_id_polymarket_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."polymarket_markets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paper_trades" ADD CONSTRAINT "paper_trades_analysis_id_market_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."market_analysis"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "polymarket_markets" ADD CONSTRAINT "polymarket_markets_parsed_location_id_locations_id_fk" FOREIGN KEY ("parsed_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weather_forecasts" ADD CONSTRAINT "weather_forecasts_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "locations_name_region_idx" ON "locations" USING btree ("region","name","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_analysis_market_analyzed_idx" ON "market_analysis" USING btree ("market_id","analyzed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_prices_market_at_idx" ON "market_prices" USING btree ("market_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_prices_token_at_idx" ON "market_prices" USING btree ("token_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paper_trades_status_idx" ON "paper_trades" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paper_trades_market_status_idx" ON "paper_trades" USING btree ("market_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "polymarket_markets_status_idx" ON "polymarket_markets" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "polymarket_markets_end_date_idx" ON "polymarket_markets" USING btree ("end_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portfolio_snapshots_at_idx" ON "portfolio_snapshots" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "weather_forecasts_loc_provider_valid_idx" ON "weather_forecasts" USING btree ("location_id","provider","valid_from");