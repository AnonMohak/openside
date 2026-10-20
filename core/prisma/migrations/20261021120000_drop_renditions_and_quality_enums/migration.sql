-- DropTable (also drops its foreign key)
DROP TABLE IF EXISTS "FinalOutputRendition";

-- AlterTable
ALTER TABLE "Space" DROP COLUMN IF EXISTS "totalRecordingHours";

-- AlterTable
ALTER TABLE "ParticipantRecording" DROP COLUMN IF EXISTS "audioQuality",
DROP COLUMN IF EXISTS "videoQuality";

-- AlterTable
ALTER TABLE "FinalOutput" DROP COLUMN IF EXISTS "audioQuality",
DROP COLUMN IF EXISTS "videoQuality";

-- DropEnum
DROP TYPE IF EXISTS "RenditionStatus";

-- DropEnum
DROP TYPE IF EXISTS "VideoQuality";

-- DropEnum
DROP TYPE IF EXISTS "AudioQuality";
