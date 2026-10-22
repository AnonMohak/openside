-- AlterTable
ALTER TABLE "RecordingComment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "RecordingComment" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecordingComment_parentId_idx" ON "RecordingComment"("parentId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RecordingComment_parentId_fkey'
  ) THEN
    ALTER TABLE "RecordingComment"
      ADD CONSTRAINT "RecordingComment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "RecordingComment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
