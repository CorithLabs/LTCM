CREATE TABLE IF NOT EXISTS run_case_attachments (
  id            TEXT        PRIMARY KEY,
  run_case_id   TEXT        NOT NULL REFERENCES run_cases(id) ON DELETE CASCADE,
  filename      TEXT        NOT NULL,
  original_name TEXT        NOT NULL,
  mime_type     TEXT,
  size          INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
