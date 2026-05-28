-- 017_jira_remote_links.sql — store LTCM base URL for Jira remote links and track remote link IDs

ALTER TABLE jira_config ADD COLUMN IF NOT EXISTS ltcm_base_url TEXT;
ALTER TABLE case_jira_links ADD COLUMN IF NOT EXISTS jira_remote_link_id TEXT;
