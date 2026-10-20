import {
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { ConnectionState, RoomEvent, type Room } from "livekit-client";

// When the host's recording mode is "Audio only", the whole call goes
// audio-only: every camera and screen share is turned off and locked until the
// host switches back. The host broadcasts their mode as a participant
// attribute, so every client - guests included - can see it live.

const RECORDING_MODE_ATTRIBUTE = "recordingMode";
const AUDIO_ONLY = "AUDIO_ONLY";

const ROOM_EVENTS = [
  RoomEvent.ParticipantAttributesChanged,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.Connected,
] as const;

const isAudioOnlyRoom = (room: Room) =>
  [room.localParticipant, ...room.remoteParticipants.values()].some(
    (participant) =>
      participant.attributes.role === "HOST" &&
      participant.attributes[RECORDING_MODE_ATTRIBUTE] === AUDIO_ONLY,
  );

/** True while the host has the call in audio-only mode. */
export function useIsAudioOnlyCall(): boolean {
  const room = useRoomContext();
  const subscribe = useCallback(
    (onChange: () => void) => {
      ROOM_EVENTS.forEach((event) => room.on(event, onChange));
      return () => {
        ROOM_EVENTS.forEach((event) => room.off(event, onChange));
      };
    },
    [room],
  );
  return useSyncExternalStore(subscribe, () => isAudioOnlyRoom(room));
}

interface AudioOnlyControllerProps {
  /** The host's recording mode; undefined for everyone else. */
  hostRecordingMode?: "VIDEO_AND_AUDIO" | "AUDIO_ONLY";
}

/**
 * Renders nothing. Publishes the host's mode, and on every client turns the
 * camera and screen share off whenever the call is audio-only - including a
 * camera that comes up afterwards (e.g. the pre-join camera publishing late).
 */
export const AudioOnlyController = ({
  hostRecordingMode,
}: AudioOnlyControllerProps) => {
  const { localParticipant, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const connectionState = useConnectionState();
  const isConnected = connectionState === ConnectionState.Connected;
  const isAudioOnly = useIsAudioOnlyCall();

  useEffect(() => {
    if (!isConnected || !hostRecordingMode) return;
    if (
      localParticipant.attributes[RECORDING_MODE_ATTRIBUTE] ===
      hostRecordingMode
    ) {
      return;
    }
    void localParticipant
      .setAttributes({ [RECORDING_MODE_ATTRIBUTE]: hostRecordingMode })
      .catch((error) =>
        console.error("Unable to share the call's recording mode:", error),
      );
  }, [isConnected, hostRecordingMode, localParticipant]);

  useEffect(() => {
    if (!isAudioOnly) return;
    if (isCameraEnabled) {
      void localParticipant.setCameraEnabled(false).catch(() => undefined);
    }
    if (isScreenShareEnabled) {
      void localParticipant.setScreenShareEnabled(false).catch(() => undefined);
    }
  }, [isAudioOnly, isCameraEnabled, isScreenShareEnabled, localParticipant]);

  return null;
};
