-- Add human-readable sequential ID for suites: TS-N
CREATE SEQUENCE IF NOT EXISTS suites_suite_number_seq;
ALTER TABLE suites ADD COLUMN IF NOT EXISTS suite_number INTEGER DEFAULT nextval('suites_suite_number_seq');
ALTER SEQUENCE suites_suite_number_seq OWNED BY suites.suite_number;
