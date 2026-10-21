import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useScreenRecordingContext } from "@/components/ScreenRecorder/ScreenRecordingProvider";

// The recorder is a floating panel, not a page. This route stays so existing
// links ("Record your own" on share pages, bookmarks) still work: it opens the
// panel and lands on the dashboard.
const ScreenRecorderPage = () => {
  const { openRecorder } = useScreenRecordingContext();

  useEffect(() => {
    openRecorder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Navigate to="/dashboard/home" replace />;
};

export default ScreenRecorderPage;
