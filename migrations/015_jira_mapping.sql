CREATE TABLE IF NOT EXISTS jira_status_mapping (
  ltcm_event        TEXT PRIMARY KEY,   -- 'pass' | 'fail' | 'in_progress'
  jira_status_name  TEXT NOT NULL
);
