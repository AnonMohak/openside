// A live all-black video track, recorded in place of the camera while it's off
// so a take stays a video (black under the audio, or black on its own when the
// mic is off too) instead of becoming audio-only or nothing at all.

/** 720p 16:9: as big as a typical call camera, so it never sets a larger
 *  master size than the real camera does. */
const WIDTH = 1280;
const HEIGHT = 720;
/** A canvas only emits a frame when it's painted. Background tabs throttle
 *  timers to ~1/s, which is still plenty for a black frame. */
const FPS = 5;

export interface BlackVideoSource {
  track: MediaStreamTrack;
  stop: () => void;
}

export function createBlackVideoTrack(): BlackVideoSource | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof canvas.captureStream !== "function") return null;

  const paint = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  };
  paint();
  const track = canvas.captureStream(FPS).getVideoTracks()[0];
  if (!track) return null;
  const interval = setInterval(paint, 1000 / FPS);

  return {
    track,
    stop: () => {
      clearInterval(interval);
      track.stop();
    },
  };
}
