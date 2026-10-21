import { backdropMotion, usePresence } from "@/hooks/usePresence";
import RecorderCameraOverlay from "./RecorderCameraOverlay";
import RecorderControlsBar from "./RecorderControlsBar";
import RecorderSettingsOverlay from "./RecorderSettingsOverlay";
import { useScreenRecordingContext } from "./ScreenRecordingProvider";

/**
 * The floating recorder: a camera bubble (bottom-right) and a settings card
 * with the Start button (top-right, pinned). While setting
 * up, the app behind them fades back (clicking it closes the recorder); once a
 * take is live the backdrop goes
 * so the rest of the app is usable. It's app-level, so both overlays stay up -
 * and keep recording - across navigation.
 */
interface ScreenRecorderPanelProps {
  /** Playing the exit animation before unmounting. */
  isClosing: boolean;
}

const ScreenRecorderPanel = ({ isClosing }: ScreenRecorderPanelProps) => {
  const { isActive, closeRecorder } = useScreenRecordingContext();
  const backdrop = usePresence(!isActive && !isClosing);
  // Settings only shape the next take - hidden while one is live, so the card
  // isn't sitting over (and captured in) the recorded screen.
  const settings = usePresence(!isActive && !isClosing);

  return (
    <>
      {backdrop.rendered && (
        // Clicking outside the overlays while setting up closes the recorder.
        <div
          aria-hidden
          onClick={closeRecorder}
          className={`fixed inset-0 z-[85] bg-black/50 backdrop-blur-[2px] ${backdropMotion(backdrop.isClosing)}`}
        />
      )}
      {settings.rendered && (
        <RecorderSettingsOverlay isClosing={settings.isClosing} />
      )}
      <RecorderControlsBar isClosing={isClosing} />
      <RecorderCameraOverlay isClosing={isClosing} />
    </>
  );
};

export default ScreenRecorderPanel;
