import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiChevronDown, FiClock } from "react-icons/fi";
import {
  useScreenOutputUrl,
  type ScreenOutputKind,
  type ScreenRecording,
} from "@/hooks/useScreenRecordings";
import { cn } from "@/lib/utils";
import { capturePoster, getCachedPoster } from "@/lib/posterCache";
import ProcessingThumbnail from "./ProcessingThumbnail";

const formatDate = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// "screenAligned" is intentionally omitted: the backend points it at the same
// file as "screen", so it would show a duplicate entry. Preference order picks
// the combined "both" first, then screen, then camera.
const KIND_ORDER: ScreenOutputKind[] = ["both", "screen", "camera"];
const RECORDINGS_PER_PAGE = 8;

// Poster frame for a screen recording, preferring the combined screen+camera
// output, then screen, then camera. Seeks a little in to skip a black intro.
const ScreenThumbnail = ({ rec }: { rec: ScreenRecording }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const outputs = rec.outputs ?? {};
  const kind = KIND_ORDER.find((k) => outputs[k]?.key);
  const posterKey = `screen:${rec.id}:${kind ?? ""}`;
  const { data: url, isError } = useScreenOutputUrl(rec.id, kind);
  const [corsBlocked, setCorsBlocked] = useState(false);
  const [poster, setPoster] = useState<string | null>(() =>
    getCachedPoster(posterKey),
  );
  // A frame (poster or seeked video) is on screen - fades in over the shimmer.
  const [frameShown, setFrameShown] = useState(false);
  const failed = isError || loadFailed;
  const showVideo = !poster && !!kind && !failed && !!url;

  // Retry without CORS if the CORS-mode load fails, so the video still shows.
  const handleError = () => {
    if (!corsBlocked) setCorsBlocked(true);
    else setLoadFailed(true);
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    } catch {
      // ignore - some streams don't allow seeking before play
    }
  };

  const handleSeeked = () => {
    setFrameShown(true);
    // A no-CORS frame can't be read back, so it isn't cached as a poster.
    if (!corsBlocked && videoRef.current) {
      setPoster(capturePoster(posterKey, videoRef.current));
    }
  };

  // Same as the meeting project cards: a shimmer until the frame has loaded,
  // then the frame fades in; plain gray when there's nothing to show.
  const frameClass = cn(
    "absolute inset-0 h-full w-full object-cover transition-opacity duration-300",
    frameShown ? "opacity-100" : "opacity-0",
  );
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
      {!!kind && !failed && !frameShown && (
        <div className="skeleton-shimmer absolute inset-0 h-full w-full" />
      )}
      {poster ? (
        <img
          src={poster}
          alt=""
          onLoad={() => setFrameShown(true)}
          className={frameClass}
        />
      ) : showVideo ? (
        <video
          key={corsBlocked ? "no-cors" : "cors"}
          ref={videoRef}
          src={url}
          muted
          playsInline
          preload="metadata"
          crossOrigin={corsBlocked ? undefined : "anonymous"}
          onLoadedMetadata={handleLoadedMetadata}
          onSeeked={handleSeeked}
          onError={handleError}
          className={frameClass}
        />
      ) : null}
    </div>
  );
};

// Library card - mirrors the space ProjectCard: the whole card opens the
// recording's project page, where playback, downloads, rename, and delete live.
// `compact` matches the dashboard's recent-projects cards exactly.
export const ScreenRecordingCard = ({
  rec,
  compact = false,
}: {
  rec: ScreenRecording;
  compact?: boolean;
}) => {
  const navigate = useNavigate();
  const startedAt = rec.startedAt || rec.createdAt;
  const recordedAt = formatDate(startedAt);

  return (
    <button
      type="button"
      onClick={() => navigate(`/dashboard/project/screen/${rec.id}`)}
      className={cn(
        "flex flex-col gap-3 rounded-xl bg-primary p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
        compact
          ? "cursor-pointer overflow-hidden border border-border/50 transition-opacity hover:opacity-80"
          : "border border-border transition-colors hover:border-fg-faint",
      )}
    >
      <div className="relative w-full">
        {rec.status === "READY" ? (
          <ScreenThumbnail rec={rec} />
        ) : (
          <ProcessingThumbnail failed={rec.status === "FAILED"} />
        )}
      </div>

      <div className="min-w-0 space-y-1 px-1 pb-1">
        <p className="truncate text-sm font-semibold text-foreground">
          {rec.title || "Untitled recording"}
        </p>
        {compact ? (
          <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
            <span className="whitespace-nowrap">Screen recording</span>
            {startedAt && (
              <>
                <span>·</span>
                <span className="whitespace-nowrap">
                  {new Date(startedAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </>
            )}
          </p>
        ) : (
          recordedAt && (
            <p className="flex items-center gap-1 text-xs text-fg-subtle">
              <FiClock className="size-3" />
              Recorded {recordedAt}
            </p>
          )
        )}
      </div>
    </button>
  );
};

const ScreenRecordingCardSkeleton = () => (
  <div className="flex flex-col gap-3 rounded-xl border border-border bg-primary p-3">
    <div className="aspect-video animate-pulse rounded-lg bg-muted" />
    <div className="space-y-2 px-1 pb-1">
      <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  </div>
);

const ScreenRecordingsSection = ({
  recordings,
  isLoading = false,
}: {
  recordings: ScreenRecording[];
  isLoading?: boolean;
}) => {
  const [visibleCount, setVisibleCount] = useState(RECORDINGS_PER_PAGE);
  if (!isLoading && recordings.length === 0) return null;

  const visibleRecordings = recordings.slice(0, visibleCount);
  const remainingRecordings = Math.max(
    0,
    recordings.length - visibleRecordings.length,
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Screen recordings
        </h2>
        {!isLoading && (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-[0.7rem] font-medium text-fg-muted ring-1 ring-border">
            {recordings.length}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, index) => (
              <ScreenRecordingCardSkeleton key={index} />
            ))
          : visibleRecordings.map((rec) => (
              <ScreenRecordingCard key={rec.id} rec={rec} />
            ))}
      </div>
      {!isLoading && remainingRecordings > 0 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() =>
              setVisibleCount((count) =>
                Math.min(count + RECORDINGS_PER_PAGE, recordings.length),
              )
            }
            className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-opacity hover:opacity-70"
          >
            Show more
            <span className="text-fg-subtle">({remainingRecordings} more)</span>
            <FiChevronDown size={14} />
          </button>
        </div>
      )}
    </section>
  );
};

export default ScreenRecordingsSection;
