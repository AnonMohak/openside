import { useEffect, useState } from "react";

// Mean luma below this (0-255) reads as a dim room on most webcams.
const LOW_LIGHT_LUMA = 55;
const SAMPLE_INTERVAL_MS = 1000;

/**
 * Whether a live camera track looks too dark. Once a second the current frame
 * is drawn onto a tiny 32x18 canvas (so it's cheap) and its average brightness
 * compared against LOW_LIGHT_LUMA. Uses its own detached <video>, so callers
 * don't need access to whatever element renders the track.
 */
export function useLowLight(track: MediaStreamTrack | null | undefined) {
  const [isLowLight, setIsLowLight] = useState(false);

  useEffect(() => {
    setIsLowLight(false);
    if (!track || track.readyState !== "live") return;

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => undefined);

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const sample = () => {
      if (video.readyState < 2 || track.readyState !== "live") return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let total = 0;
      for (let i = 0; i < data.length; i += 4) {
        total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      }
      setIsLowLight(total / (data.length / 4) < LOW_LIGHT_LUMA);
    };

    const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
      video.pause();
      video.srcObject = null;
    };
  }, [track]);

  return isLowLight;
}
