import type { LiveKitJoinConfig } from "./spaceTypes";

export interface PreJoinSettings {
  videoEnabled: boolean;
  audioEnabled: boolean;
  name: string;
  avatar?: string;
  audioDeviceId?: string;
  echoCancellation?: boolean;
  videoDeviceId?: string;
  audioOutputDeviceId?: string;
  livekit?: LiveKitJoinConfig;
  /**
   * The live pre-join preview (only the kinds left on). The call publishes these
   * tracks instead of re-opening the camera/mic, so they go live on connect.
   */
  previewStream?: MediaStream;
}
