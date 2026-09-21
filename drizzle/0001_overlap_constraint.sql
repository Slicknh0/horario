-- Custom SQL migration file, put your code below! --
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_blocked_after_end"
  CHECK ("blocked_until" >= "ends_at");
--> statement-breakpoint
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_no_overlap"
  EXCLUDE USING gist (
    "tenant_id" WITH =,
    tstzrange("starts_at", "blocked_until") WITH &&
  ) WHERE ("status" = 'confirmed');
