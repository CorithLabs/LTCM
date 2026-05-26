-- Track who created/modified test cases and who started runs
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS created_by  TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ;
ALTER TABLE runs       ADD COLUMN IF NOT EXISTS created_by  TEXT REFERENCES users(id) ON DELETE SET NULL;
