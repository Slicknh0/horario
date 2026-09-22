-- Custom SQL migration file, put your code below! --
-- An empty tstzrange overlaps nothing: a row with blocked_until = starts_at
-- produces tstzrange(starts_at, blocked_until) = '[starts_at, starts_at)',
-- which is empty by definition, so appointment_no_overlap (drizzle/0001_
-- overlap_constraint.sql) never sees it as a conflict with anything. The
-- existing appointment_blocked_after_end CHECK only asserts
-- blocked_until >= ends_at — it says nothing about ends_at vs. starts_at,
-- so a degenerate row (ends_at <= starts_at, with blocked_until following
-- suit) was rejected only by an application-level rule in a different file
-- for a different concern (durationMinutes: z.number().int().min(5) in
-- src/actions/service.ts), not by the database. This closes that gap the
-- same way the sibling constraint already does: at the one place that
-- can't be bypassed by a new call site forgetting to re-check it.
ALTER TABLE "appointment"
  ADD CONSTRAINT "appointment_ends_after_starts"
  CHECK ("ends_at" > "starts_at");
