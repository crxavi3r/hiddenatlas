-- Add email column to Creator table.
-- Stores the linked user's email at creation time so it is available
-- without joining through the User table.
ALTER TABLE "Creator" ADD COLUMN IF NOT EXISTS email TEXT;
