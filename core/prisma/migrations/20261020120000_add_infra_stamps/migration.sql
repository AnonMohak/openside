-- AlterTable
ALTER TABLE "Space" ADD COLUMN IF NOT EXISTS "selfHosted" BOOLEAN;

-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN IF NOT EXISTS "selfHosted" BOOLEAN;
