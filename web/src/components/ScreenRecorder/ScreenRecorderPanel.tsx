import { backdropMotion, usePresence } from "@/hooks/usePresence";
import RecorderCameraOverlay from "./RecorderCameraOverlay";
import RecorderControlsBar from "./RecorderControlsBar";
import RecorderSettingsOverlay from "./RecorderSettingsOverlay";
import RecorderUploadCard from "./RecorderUploadCard";
import { useScreenRecordingContext } from "./ScreenRecordingProvider";

/**
 * The floating recorder: a camera bubble, the settings toolbar and the take's
 * control bar over a faded page. Clicking the page closes the recorder while
 * setting up; once a take is live only Stop ends it. It's app-level, so the
 * overlays stay up - and keep recording - across navigation.
 */
interface ScreenRecorderPanelProps {
  /** Playing the exit animation before unmounting. */
  isClosing: boolean;
}

const ScreenRecorderPanel = ({ isClosing }: ScreenRecorderPanelProps) => {
  const { isActive, recordingState, closeRecorder } =
    useScreenRecordingContext();
  // The page stays faded for the whole session, recording included - only
  // the recorder's own controls are meant to be used meanwhile.
  const backdrop = usePresence(!isClosing);
  // Settings only shape the next take - hidden while one is live, so the card
  // isn't sitting over (and captured in) the recorded screen.
  const settings = usePresence(!isActive && !isClosing);
  // After Stop: the upload, and that the recording opens when it ends.
  const upload = usePresence(
    (recordingState === "stopping" || recordingState === "uploading") &&
      !isClosing,
  );

  return (
    <>
      {backdrop.rendered && (
        // Clicking outside the overlays closes the recorder while setting up;
        // once a take is live only the Stop button ends it.
        <div
          aria-hidden
          onClick={isActive ? undefined : closeRecorder}
          className={`fixed inset-0 z-[85] bg-black/50 backdrop-blur-[2px] ${backdropMotion(backdrop.isClosing)}`}
        />
      )}
      {settings.rendered && (
        <RecorderSettingsOverlay isClosing={settings.isClosing} />
      )}
      {upload.rendered && <RecorderUploadCard isClosing={upload.isClosing} />}
      <RecorderControlsBar isClosing={isClosing} />
      <RecorderCameraOverlay isClosing={isClosing} />
    </>
  );
};

export default ScreenRecorderPanel;
