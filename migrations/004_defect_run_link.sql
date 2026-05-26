-- 004_defect_run_link.sql — Track which run a defect was created from (Postgres)

ALTER TABLE case_jira_links ADD COLUMN IF NOT EXISTS source_run_id TEXT REFERENCES runs(id) ON DELETE SET NULL;
ALTER TABLE case_jira_links ADD COLUMN IF NOT EXISTS jira_issue_url TEXT;
