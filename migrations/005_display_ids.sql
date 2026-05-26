-- Add human-readable sequential IDs for traceability

-- test_cases: TC-N display ID
CREATE SEQUENCE IF NOT EXISTS test_cases_case_number_seq;
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS case_number INTEGER DEFAULT nextval('test_cases_case_number_seq');
ALTER SEQUENCE test_cases_case_number_seq OWNED BY test_cases.case_number;

-- runs: RUN-N display ID
CREATE SEQUENCE IF NOT EXISTS runs_run_number_seq;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS run_number INTEGER DEFAULT nextval('runs_run_number_seq');
ALTER SEQUENCE runs_run_number_seq OWNED BY runs.run_number;

-- run_cases: snapshot case_number at run creation time
ALTER TABLE run_cases ADD COLUMN IF NOT EXISTS case_number INTEGER;
