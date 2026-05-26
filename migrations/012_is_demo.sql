-- 012_is_demo.sql — mark demo project so non-admins cannot delete it
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
