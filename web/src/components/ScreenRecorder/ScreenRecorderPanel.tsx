import { backdropMotion, usePresence } from "@/hooks/usePresence";
import RecorderCameraOverlay from "./RecorderCameraOverlay";
import RecorderControlsBar from "./RecorderControlsBar";
import RecorderSettingsOverlay from "./RecorderSettingsOverlay";
import RecorderUploadCard from "./RecorderUploadCard";
import { useScreenRecordingContext } from "./ScreenRecordingProvider";

/**
 * The floating recorder: a camera bubble, the settings toolbar and the take's
 * control bar. While setting up the page behind is faded (clicking it closes
 * the recorder); once Start is pressed the fade goes, so the rest of the app
 * is usable during the take. It's app-level, so the overlays stay up - and
 * keep recording - across navigation.
 */
interface ScreenRecorderPanelProps {
  /** Playing the exit animation before unmounting. */
  isClosing: boolean;
}

const ScreenRecorderPanel = ({ isClosing }: ScreenRecorderPanelProps) => {
  const { isActive, recordingState, closeRecorder } =
    useScreenRecordingContext();
  // Faded only while setting up. It leaves as soon as Start is pressed, so its
  // exit is over before the countdown ends and never lands in the recording.
  const backdrop = usePresence(!isActive && !isClosing);
  // Settings only shape the next take - hidden while one is live, so the card
  // isn't sitting over (and captured in) the recorded screen.
  const settings = usePresence(!isActive && !isClosing);
  // The take's controls replace the toolbar at the bottom once Start is
  // pressed, and stay through the save.
  const controls = usePresence(isActive && !isClosing);
  // After Stop: the upload, and that the recording opens when it ends.
  const upload = usePresence(
    (recordingState === "stopping" || recordingState === "uploading") &&
      !isClosing,
  );

  return (
    <>
      {backdrop.rendered && (
        // Clicking outside the overlays closes the recorder while setting up.
        <div
          aria-hidden
          onClick={closeRecorder}
          className={`fixed inset-0 z-[85] bg-black/50 backdrop-blur-[2px] ${backdropMotion(backdrop.isClosing)}`}
        />
      )}
      {settings.rendered && (
        <RecorderSettingsOverlay isClosing={settings.isClosing} />
      )}
      {upload.rendered && <RecorderUploadCard isClosing={upload.isClosing} />}
      {controls.rendered && (
        <RecorderControlsBar isClosing={controls.isClosing} />
      )}
      <RecorderCameraOverlay isClosing={isClosing} />
    </>
  );
};

export default ScreenRecorderPanel;
