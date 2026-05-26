-- 002_jira.sql — Jira Integration schema (Postgres)

CREATE TABLE IF NOT EXISTS jira_config (
  id TEXT PRIMARY KEY,
  base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  project_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_jira_links (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  jira_issue_key TEXT NOT NULL,
  jira_issue_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(case_id, jira_issue_key)
);

ALTER TABLE runs ADD COLUMN IF NOT EXISTS jira_version_id TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS jira_version_name TEXT;

CREATE INDEX IF NOT EXISTS idx_case_jira_links_case ON case_jira_links(case_id);
