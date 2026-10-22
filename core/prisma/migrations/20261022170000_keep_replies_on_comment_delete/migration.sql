-- Replies outlive the message they quote: deleting it just clears parentId.
ALTER TABLE "RecordingComment" DROP CONSTRAINT IF EXISTS "RecordingComment_parentId_fkey";
ALTER TABLE "RecordingComment"
  ADD CONSTRAINT "RecordingComment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "RecordingComment"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
