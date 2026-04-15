-- Add role column to User table.
-- Valid values: 'user' (default), 'admin', 'designer'
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Seed known admin accounts
UPDATE "User"
SET role = 'admin'
WHERE email IN ('cristiano.xavier@outlook.com', 'cristiano.xavier@hiddenatlas.travel');

CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"(role);
