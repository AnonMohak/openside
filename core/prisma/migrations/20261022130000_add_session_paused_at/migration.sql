-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN IF NOT EXISTS "pausedAt" TIMESTAMP(3);
