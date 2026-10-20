import { useEffect, useRef, useState } from "react";

/** Length of every overlay's enter/exit animation (tw-animate default). */
export const OVERLAY_ANIMATION_MS = 150;

/**
 * Keeps an overlay mounted long enough to play its exit animation.
 *
 * Pass whatever decides if it shows - a boolean, or the item it's about (e.g.
 * the recording being deleted). `rendered` is that value while open and the
 * last truthy value while closing, so the dialog keeps its content as it fades
 * out; it turns null once the exit has finished.
 */
export function usePresence<T>(value: T | null | undefined | false) {
  const open = Boolean(value);
  const lastRef = useRef<T | null>(value || null);
  if (value) lastRef.current = value;

  // Flip to closing in the same render the value goes falsy - waiting for an
  // effect would unmount the overlay for a frame before the exit plays.
  const [prevOpen, setPrevOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    setClosing(!open);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => {
      lastRef.current = null;
      setClosing(false);
    }, OVERLAY_ANIMATION_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  return {
    rendered: open ? (value as T) : closing ? lastRef.current : null,
    isClosing: !open && closing,
  };
}

/**
 * Backdrop fade. Holds the final frame on exit instead of snapping back, and
 * ignores clicks while closing so a double click can't reopen/re-close it.
 */
export const backdropMotion = (isClosing: boolean) =>
  isClosing
    ? "pointer-events-none animate-out fade-out-0 fill-mode-forwards duration-150"
    : "animate-in fade-in-0 duration-150";

/** Dialog panel fade + scale, matching the schedule modal. */
export const panelMotion = (isClosing: boolean) =>
  isClosing
    ? "animate-out fade-out-0 zoom-out-95 fill-mode-forwards duration-150"
    : "animate-in fade-in-0 zoom-in-95 duration-150";
