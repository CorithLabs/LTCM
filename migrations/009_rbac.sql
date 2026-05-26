-- 009_rbac.sql — RBAC: users, sessions, project membership, per-user Jira credentials

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tester' CHECK (role IN ('admin', 'tester')),
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions table (connect-pg-simple)
CREATE TABLE IF NOT EXISTS session (
  sid TEXT NOT NULL PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_expire ON session(expire);

-- Project membership — which testers are assigned to which projects
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

-- Per-user Jira credentials (email + encrypted API token)
CREATE TABLE IF NOT EXISTS jira_user_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  api_token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Move jira_project_key to project level
ALTER TABLE projects ADD COLUMN IF NOT EXISTS jira_project_key TEXT;

-- Copy global jira project_key to all existing projects (best-effort)
UPDATE projects
SET jira_project_key = (SELECT project_key FROM jira_config LIMIT 1)
WHERE jira_project_key IS NULL
  AND EXISTS (SELECT 1 FROM jira_config);

-- Make jira_config email/token nullable (they move to per-user credentials)
ALTER TABLE jira_config ALTER COLUMN email DROP NOT NULL;
ALTER TABLE jira_config ALTER COLUMN api_token_encrypted DROP NOT NULL;
ALTER TABLE jira_config ALTER COLUMN project_key DROP NOT NULL;