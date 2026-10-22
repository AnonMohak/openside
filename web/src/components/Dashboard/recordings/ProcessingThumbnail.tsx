import { FiAlertTriangle, FiLoader } from "react-icons/fi";

/**
 * A recording card's thumbnail while its video isn't ready: a softly
 * shimmering frame with a spinner and "Processing", or a warning when
 * processing failed. Same 16:9 frame as a real thumbnail, so cards line up.
 */
const ProcessingThumbnail = ({ failed = false }: { failed?: boolean }) => (
  <div className="relative flex aspect-video flex-col items-center justify-center gap-2.5 overflow-hidden rounded-lg bg-muted">
    {!failed && (
      // .skeleton-shimmer sets its own position, so it sits in an absolute
      // wrapper to stay behind the content instead of pushing it down.
      <div className="absolute inset-0">
        <div className="skeleton-shimmer h-full w-full" />
      </div>
    )}
    {failed ? (
      <FiAlertTriangle className="relative size-5 text-danger" />
    ) : (
      <FiLoader className="relative size-5 animate-spin text-fg-muted" />
    )}
    <div className="relative space-y-0.5 px-4 text-center">
      <p className="text-xs font-medium text-foreground/85">
        {failed ? "Processing failed" : "Processing"}
      </p>
      <p className="text-[0.7rem] text-fg-subtle">
        {failed ? "Open it to see what's left" : "Ready in a moment"}
      </p>
    </div>
  </div>
);

export default ProcessingThumbnail;
