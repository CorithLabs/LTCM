-- 001_init.sql — Full LTCM schema (Postgres)

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) <= 255),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK(last_run_status IN ('in_progress', 'completed') OR last_run_status IS NULL)
);

CREATE TABLE IF NOT EXISTS suites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK(length(name) <= 255),
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) <= 255),
  preconditions TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  expected_result TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS run_cases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  preconditions TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  expected_result TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium',
  suite_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT CHECK(status IN ('pass', 'fail', 'skip', 'blocked', 'na') OR status IS NULL),
  note TEXT,
  step_results TEXT
);

CREATE INDEX IF NOT EXISTS idx_suites_project ON suites(project_id);
CREATE INDEX IF NOT EXISTS idx_cases_suite ON test_cases(suite_id);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_run_cases_run ON run_cases(run_id);
