// Whether turning the camera on in a call shows the preview first (the
// default) or goes straight live. Set from the in-call settings.

const STORAGE_KEY = "openside:cameraPreviewBeforeOn";

export function shouldPreviewCamera(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setPreviewCamera(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Remembering the choice is a convenience only.
  }
}
