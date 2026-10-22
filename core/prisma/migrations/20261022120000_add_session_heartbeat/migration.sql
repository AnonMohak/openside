-- AlterTable
ALTER TABLE "RecordingSession" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);
