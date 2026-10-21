import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from "react";

type Corner = "top-right" | "bottom-right";

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  /** Where the element starts, before the user moves it. */
  corner: Corner;
  /** Gap from the viewport edges for the starting spot. */
  offset?: { x: number; y: number };
}

// Pressing these never starts a drag - they keep working as controls.
const INTERACTIVE = "button, a, input, select, textarea, label, [data-no-drag]";
// A drag only counts once the pointer moves this far, so taps stay taps.
const DRAG_THRESHOLD_PX = 3;

const toTranslate = ({ x, y }: Position) => `${x}px ${y}px`;

/**
 * Lets a fixed-position overlay be dragged anywhere in the viewport. It starts
 * anchored to a corner, then is placed with the `translate` property (left/top
 * pinned to 0) so moving it is a compositor-only change. While dragging, the
 * element is moved directly once per animation frame - React only hears about
 * the final spot - so a heavy subtree (a live video) never re-renders per
 * pointer event. It's kept on screen when the window or the element resizes.
 */
export default function useDraggable<T extends HTMLElement>({
  corner,
  offset = { x: 16, y: 16 },
}: UseDraggableOptions) {
  const ref = useRef<T | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const positionRef = useRef<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);

  const clamp = useCallback((x: number, y: number): Position => {
    const el = ref.current;
    const width = el?.offsetWidth ?? 0;
    const height = el?.offsetHeight ?? 0;
    return {
      x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - width)),
      y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - height)),
    };
  }, []);

  const commit = useCallback((next: Position) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  // Swap the CSS corner anchor for a position once it's measured. Computed
  // from the size, not getBoundingClientRect(), which an enter animation's
  // scale would skew.
  const { x: offsetX, y: offsetY } = offset;
  useLayoutEffect(() => {
    const el = ref.current;
    if (positionRef.current || !el) return;
    const x = window.innerWidth - el.offsetWidth - offsetX;
    const y =
      corner === "top-right"
        ? offsetY
        : window.innerHeight - el.offsetHeight - offsetY;
    commit(clamp(x, y));
  }, [clamp, commit, corner, offsetX, offsetY]);

  // Stay fully visible when the window shrinks or the overlay grows.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const keepInView = () => {
      const current = positionRef.current;
      if (!current || dragRef.current?.moved) return;
      const next = clamp(current.x, current.y);
      if (next.x !== current.x || next.y !== current.y) commit(next);
    };
    window.addEventListener("resize", keepInView);
    const observer = new ResizeObserver(keepInView);
    observer.observe(el);
    return () => {
      window.removeEventListener("resize", keepInView);
      observer.disconnect();
    };
  }, [clamp, commit]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    const current = positionRef.current;
    if (event.button !== 0 || !el || !current) return;
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: event.clientX - current.x,
      dy: event.clientY - current.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved) {
      const distance = Math.hypot(
        event.clientX - drag.startX,
        event.clientY - drag.startY,
      );
      if (distance < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setIsDragging(true);
    }
    positionRef.current = clamp(event.clientX - drag.dx, event.clientY - drag.dy);
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const el = ref.current;
      if (el && positionRef.current) {
        el.style.translate = toTranslate(positionRef.current);
      }
    });
  };

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!drag.moved) return;
    setIsDragging(false);
    if (positionRef.current) commit(positionRef.current);
  };

  const style: CSSProperties = position
    ? {
        left: 0,
        top: 0,
        translate: toTranslate(position),
        willChange: isDragging ? "translate" : undefined,
      }
    : corner === "top-right"
      ? { right: offset.x, top: offset.y }
      : { right: offset.x, bottom: offset.y };

  return {
    ref,
    style,
    isDragging,
    /** Spread onto the element (or part of it) that acts as the handle. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
