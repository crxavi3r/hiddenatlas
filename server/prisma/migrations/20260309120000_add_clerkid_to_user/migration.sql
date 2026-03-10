-- Add clerkId to User table (already applied directly to production DB)
ALTER TABLE "User" ADD COLUMN "clerkId" TEXT;
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
