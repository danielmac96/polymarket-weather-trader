CREATE TYPE "public"."risk_tolerance" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trading_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"unit_size_usd" double precision DEFAULT 10 NOT NULL,
	"risk_tolerance" "risk_tolerance" DEFAULT 'MEDIUM' NOT NULL,
	"auto_trade_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trading_settings" ADD CONSTRAINT "trading_settings_singleton" CHECK ("id" = 1);--> statement-breakpoint
INSERT INTO "trading_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
