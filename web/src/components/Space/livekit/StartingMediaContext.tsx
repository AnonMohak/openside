import { createContext, useContext } from "react";

/**
 * Set while the call is connecting and publishing the camera/mic chosen on
 * pre-join. LiveKit reports both as off until they're published, so the UI
 * shows these choices instead and locks the media controls meanwhile.
 */
export interface StartingMedia {
  audioOn: boolean;
  videoOn: boolean;
  /** Live pre-join camera track, shown on the local tile until it's published. */
  videoTrack?: MediaStreamTrack;
}

export const StartingMediaContext = createContext<StartingMedia | null>(null);

export const useStartingMedia = () => useContext(StartingMediaContext);
