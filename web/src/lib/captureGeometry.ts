/**
 * Where an on-page element appears inside a screen capture, as fractions (0-1)
 * of the captured frame. The screen recorder's camera bubble is itself in the
 * screen capture, so finalization uses this to lay the full-quality camera
 * exactly over it.
 *
 * Everything is in CSS pixels. What the frame is depends on what was shared:
 *   - "browser": this tab - the frame is the page's viewport.
 *   - "window":  a browser window - the frame is the whole window, including
 *                its tabs and toolbar (assumed to be the window we're in).
 *   - "monitor": a whole display - the frame is the screen.
 */

export interface CaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius as a fraction of the element's height. */
  radius: number;
}

interface Frame {
  /** The viewport's top-left inside the frame. */
  left: number;
  top: number;
  width: number;
  height: number;
}

function frameFor(surface: string | undefined): Frame {
  const viewport = {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  // Side/bottom window borders (zero on macOS), then the tabs and toolbar.
  const border = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const toolbar = Math.max(
    0,
    window.outerHeight - window.innerHeight - border,
  );

  if (surface === "window") {
    return {
      left: border,
      top: toolbar,
      width: window.outerWidth,
      height: window.outerHeight,
    };
  }

  if (surface === "monitor") {
    const screenInfo = window.screen as Screen & {
      availLeft?: number;
      availTop?: number;
    };
    // The display's origin in global coordinates. availTop is pushed down by a
    // top menu bar (macOS); on the main display that bar starts at 0.
    const originX = screenInfo.availLeft ?? 0;
    const availTop = screenInfo.availTop ?? 0;
    const originY = availTop < 100 ? 0 : availTop;
    return {
      left: window.screenX - originX + border,
      top: window.screenY - originY + toolbar,
      width: screenInfo.width,
      height: screenInfo.height,
    };
  }

  return viewport;
}

export function measureCaptureRect(
  element: HTMLElement | null,
  surface: string | undefined,
): CaptureRect | undefined {
  if (!element) return undefined;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return undefined;

  const frame = frameFor(surface);
  if (frame.width <= 0 || frame.height <= 0) return undefined;

  const radiusPx = parseFloat(getComputedStyle(element).borderTopLeftRadius);
  return {
    x: (frame.left + rect.left) / frame.width,
    y: (frame.top + rect.top) / frame.height,
    width: rect.width / frame.width,
    height: rect.height / frame.height,
    radius: Number.isFinite(radiusPx)
      ? Math.min(0.5, radiusPx / rect.height)
      : 0,
  };
}
