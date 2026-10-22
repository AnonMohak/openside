import { useRef, useState, type CSSProperties } from "react";
import { GripVertical } from "lucide-react";

const STORAGE_KEY = "openside:comments-rail-width";
const DEFAULT_WIDTH = 380;
const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
/** The video side always keeps at least this much room. */
const MIN_VIDEO_WIDTH = 420;

const clamp = (width: number, containerWidth?: number) => {
  const max = containerWidth
    ? Math.min(MAX_WIDTH, containerWidth - MIN_VIDEO_WIDTH)
    : MAX_WIDTH;
  return Math.round(Math.max(MIN_WIDTH, Math.min(width, max)));
};

const readStoredWidth = () => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return stored ? clamp(stored) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

/**
 * Drag-to-resize for the comments rail beside a recording's video (desktop
 * only). The width is a per-viewer preference kept in localStorage.
 *
 * Spread `gridStyle` on the two-column grid and give it
 * `lg:grid-cols-[minmax(0,1fr)_var(--comments-rail-width)]` plus `relative`;
 * render `handle` inside that grid.
 */
export const useCommentsRailResizer = () => {
  const [width, setWidth] = useState(readStoredWidth);
  const [dragging, setDragging] = useState(false);
  const handleRef = useRef<HTMLDivElement>(null);

  const save = (next: number) => {
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Storage blocked - the width just won't be remembered.
    }
  };

  const gridStyle = {
    "--comments-rail-width": `${width}px`,
  } as CSSProperties;

  const handle = (
    <div
      ref={handleRef}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize comments"
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      style={{ right: width }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const grid = handleRef.current?.parentElement;
        if (!grid) return;
        const rect = grid.getBoundingClientRect();
        setWidth(clamp(rect.right - event.clientX, rect.width));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
        document.body.style.userSelect = "";
        save(width);
      }}
      onDoubleClick={() => {
        setWidth(DEFAULT_WIDTH);
        save(DEFAULT_WIDTH);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 48 : 16;
        const grid = handleRef.current?.parentElement;
        const containerWidth = grid?.getBoundingClientRect().width;
        // Left widens the rail (its edge moves left), right narrows it.
        const delta =
          event.key === "ArrowLeft"
            ? step
            : event.key === "ArrowRight"
              ? -step
              : 0;
        if (!delta) return;
        const next = clamp(width + delta, containerWidth);
        event.preventDefault();
        setWidth(next);
        save(next);
      }}
      className="group absolute inset-y-0 z-10 hidden w-4 translate-x-1/2 cursor-col-resize items-center justify-center outline-none lg:flex"
    >
      {/* Nothing extra at rest. On hover (or while dragging) the line turns
          brand and a grip fades in at its middle. */}
      <span
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
          dragging
            ? "bg-brand"
            : "bg-transparent group-hover:bg-brand group-focus-visible:bg-brand"
        }`}
      />
      <span
        className={`relative flex h-7 w-4 items-center justify-center rounded-md bg-brand text-white shadow-sm transition-all duration-150 ${
          dragging
            ? "scale-100 opacity-100"
            : "scale-75 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
        }`}
      >
        <GripVertical className="size-3.5" />
      </span>
    </div>
  );

  return { gridStyle, handle };
};
