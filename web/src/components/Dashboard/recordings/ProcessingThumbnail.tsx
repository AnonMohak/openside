import { FiAlertTriangle, FiLoader } from "react-icons/fi";

/**
 * A recording card's thumbnail while its video isn't ready: a softly
 * shimmering frame with a spinner and "Processing…", or a warning when
 * processing failed. Same 16:9 frame as a real thumbnail, so cards line up.
 */
const ProcessingThumbnail = ({ failed = false }: { failed?: boolean }) => (
  <div className="relative flex aspect-video flex-col items-center justify-center gap-2 overflow-hidden rounded-lg bg-muted">
    {!failed && (
      <div className="skeleton-shimmer absolute inset-0 h-full w-full opacity-60" />
    )}
    <span className="relative flex size-10 items-center justify-center rounded-full bg-background/80 shadow-sm">
      {failed ? (
        <FiAlertTriangle className="size-4 text-danger" />
      ) : (
        <FiLoader className="size-4 animate-spin text-fg-muted" />
      )}
    </span>
    <span
      className={`relative text-xs font-medium ${
        failed ? "text-danger" : "text-fg-muted"
      }`}
    >
      {failed ? "Processing failed" : "Processing…"}
    </span>
  </div>
);

export default ProcessingThumbnail;
