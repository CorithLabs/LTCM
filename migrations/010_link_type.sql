-- Add link_type to case_jira_links to distinguish how a link was created
ALTER TABLE case_jira_links ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (link_type IN ('manual', 'created', 'comment'));

-- Backfill: links with a source_run_id came from the defect endpoint
UPDATE case_jira_links SET link_type = 'created' WHERE source_run_id IS NOT NULL AND link_type = 'manual';
