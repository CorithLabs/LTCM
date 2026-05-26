-- Allow 'cancelled' as a run status
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check
  CHECK (status IN ('in_progress', 'completed', 'cancelled'));

-- Allow 'cancelled' as a project last_run_status
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_last_run_status_check;
ALTER TABLE projects ADD CONSTRAINT projects_last_run_status_check
  CHECK (last_run_status IN ('in_progress', 'completed', 'cancelled') OR last_run_status IS NULL);
