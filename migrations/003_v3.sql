-- 003_v3.sql — v3.0: step-level execution, blocked/na statuses, environment tagging (Postgres)
-- run_cases already has the full status set in 001_init.sql (Postgres fresh start)
-- Just add the environment column to runs

ALTER TABLE runs ADD COLUMN IF NOT EXISTS environment TEXT;
