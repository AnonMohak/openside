/**
 * App-wide upload of meeting chunks a closed or crashed tab left behind.
 *
 * Every chunk is written to IndexedDB before it uploads, but only an uploader
 * that's running can send it. Without this, chunks from a tab that died
 * mid-meeting sat there until the participant happened to rejoin a meeting.
 * Mounted at the app root, this sends them whenever the app is open - the
 * server folds them into the already-finalized recording.
 */

import { useEffect } from "react";
import useChunkUploader from "@/hooks/useChunkUploader";

/** Rescan this often for chunks a live recorder has given up on. */
const DRAIN_INTERVAL_MS = 60_000;
/** Leave recent chunks to the recorder (in this or another tab) uploading
 *  them; anything this old is an orphan. */
const MIN_ORPHAN_AGE_MS = 5 * 60_000;

const RecordingChunkDrainer = () => {
  const { resumeOrphans } = useChunkUploader(undefined, undefined, {
    concurrency: 2,
  });

  useEffect(() => {
    const drain = () => {
      void resumeOrphans({ minAgeMs: MIN_ORPHAN_AGE_MS });
    };
    drain();
    const interval = setInterval(drain, DRAIN_INTERVAL_MS);
    window.addEventListener("online", drain);
    return () => {
      clearInterval(interval);
      window.removeEventListener("online", drain);
    };
  }, [resumeOrphans]);

  return null;
};

export default RecordingChunkDrainer;
