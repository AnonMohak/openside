import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiChevronLeft,
  FiEdit2,
  FiLoader,
  FiShare2,
  FiTrash2,
  FiVideo,
} from "react-icons/fi";
import { LuDownload } from "react-icons/lu";
import {
  fetchScreenOutputUrl,
  useCreateScreenComment,
  useDeleteScreenComment,
  useDeleteScreenRecording,
  useRenameScreenRecording,
  useScreenComments,
  useScreenOutputUrl,
  useScreenRecordings,
  useShareScreenRecording,
  useUnshareScreenRecording,
  type ScreenOutputKind,
  type ScreenRecording,
} from "@/hooks/useScreenRecordings";
import RecordingComments from "./RecordingComments";
import VideoPlayer from "@/components/shared/VideoPlayer";
import RenameDialog from "@/components/shared/RenameDialog";
import ShareLinkDialog from "@/components/shared/ShareLinkDialog";
import { toast } from "@/lib/toast";
import { useRealtimeRecordingComments } from "@/hooks/useRealtimeRecordingComments";

/** Public URL a share token resolves to (the SharedRecordingPage route). */
export const shareUrlFor = (token: string) =>
  `${window.location.origin}/share/${token}`;

const formatDay = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

const triggerBrowserDownload = (url: string) => {
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// 754000 -> "12:34"; null when the length isn't known yet.
const formatClock = (ms?: number) => {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// The project exposes one finished screen video. Prefer the composed output
// (screen + camera) and fall back to screen-only when no camera was recorded.
const ScreenVideoCard = ({
  rec,
  kind,
  onShare,
}: {
  rec: ScreenRecording;
  kind: ScreenOutputKind;
  onShare: () => void;
}) => {
  const [downloading, setDownloading] = useState(false);
  const { data: url } = useScreenOutputUrl(rec.id, kind);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const downloadUrl = await fetchScreenOutputUrl(rec.id, kind, true);
      triggerBrowserDownload(downloadUrl);
    } catch {
      // Download failed; the button simply re-enables.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex w-full flex-col self-start overflow-hidden rounded-2xl border border-border/50 bg-primary">
      <div className="p-2 pb-0">
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-border/50">
          {url ? (
            <VideoPlayer key={url} src={url} />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-white/60">
              <FiLoader className="size-4 animate-spin" /> Loading…
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-foreground">
            {rec.title || "Untitled recording"}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-fg-subtle">
            {[
              rec.startedAt &&
                new Date(rec.startedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }),
              formatClock(rec.outputs?.[kind]?.durationMs),
              kind === "both" ? "Screen + camera" : "Screen",
            ]
              .filter(Boolean)
              .map((part, index) => (
                <span key={index} className="flex items-center gap-1.5">
                  {index > 0 && <span aria-hidden>·</span>}
                  {part}
                </span>
              ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onShare}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-80 cursor-pointer ${
              rec.shareToken
                ? "bg-success/10 text-success"
                : "bg-muted text-foreground"
            }`}
          >
            <FiShare2 className="size-3.5" />
            {rec.shareToken ? "Shared" : "Share"}
          </button>
          <button
            type="button"
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            {downloading ? (
              <FiLoader className="size-3.5 animate-spin" />
            ) : (
              <LuDownload className="size-3.5" />
            )}
            {downloading ? "Preparing" : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Share dialog. Opening it mints the link on first use (the mutation is
 * idempotent server-side, so re-opening never invalidates a link already sent).
 * "Stop sharing" revokes it, and any URL already handed out dies at once.
 */
const ShareDialog = ({
  rec,
  onClose,
}: {
  rec: ScreenRecording;
  onClose: () => void;
}) => {
  const share = useShareScreenRecording();
  const unshare = useUnshareScreenRecording();
  const token = rec.shareToken;

  return (
    <ShareLinkDialog
      recordingTitle={rec.title ?? undefined}
      url={token ? shareUrlFor(token) : null}
      accessNote="watch this recording and leave comments"
      isStopping={unshare.isPending}
      onCreate={() =>
        share.mutate(rec.id, {
          onError: () => {
            toast.error("Couldn't create a share link.");
            onClose();
          },
        })
      }
      onStop={() => unshare.mutate(rec.id, { onSuccess: onClose })}
      onClose={onClose}
    />
  );
};

const ScreenProjectDetailSkeleton = () => (
  <div
    aria-label="Loading recording project"
    className="flex flex-col gap-6 px-2 pb-2 pt-0 lg:h-full lg:min-h-0 lg:gap-0 lg:pb-0"
  >
    <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
        <div className="min-w-0 space-y-2">
          <div className="h-6 w-52 animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-36 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-muted" />
        <div className="h-9 w-20 animate-pulse rounded-lg bg-muted" />
      </div>
    </div>
    <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Video card: player + title/details + Share / Download */}
      <section className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pt-5">
        <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-border/50 bg-primary">
          <div className="p-2 pb-0">
            <div className="aspect-video w-full animate-pulse rounded-xl bg-muted" />
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="space-y-2">
              <div className="h-4 w-40 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="flex shrink-0 gap-2">
              <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
              <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </section>

      {/* Comments: header, bubbles, composer */}
      <aside className="flex min-h-[320px] flex-col overflow-hidden rounded-2xl border border-border/50 bg-primary lg:my-5 lg:min-h-0">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3.5">
          <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-7 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="flex flex-1 flex-col gap-3 px-4 py-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3">
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="h-14 flex-1 animate-pulse rounded-xl rounded-tl-sm bg-muted/60" />
            </div>
          ))}
        </div>
        <div className="border-t border-border/50 p-3">
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      </aside>
    </div>
  </div>
);

const ScreenProjectDetail = ({ sessionId }: { sessionId: string }) => {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [title, setTitle] = useState("");

  // The list query already carries everything the detail needs (title, status,
  // outputs) and keeps polling while the recording is still processing.
  const { data: recordings, isLoading, isError } = useScreenRecordings();
  const renameRecording = useRenameScreenRecording();
  const deleteRecording = useDeleteScreenRecording();
  const { data: comments, isLoading: areCommentsLoading } =
    useScreenComments(sessionId);
  const createComment = useCreateScreenComment(sessionId);
  const deleteComment = useDeleteScreenComment(sessionId);
  const rec = recordings?.find((recording) => recording.id === sessionId);
  // The owner joins the same verified stream as public viewers when sharing is
  // active, so incoming comments land in this panel without a refresh.
  useRealtimeRecordingComments(rec?.shareToken, "screen", sessionId);

  if (isLoading) return <ScreenProjectDetailSkeleton />;

  if (!rec) {
    return (
      <div className="flex flex-col gap-4 p-2">
        <button
          type="button"
          onClick={() => navigate("/dashboard/project")}
          className="group flex h-9 w-fit items-center gap-2 rounded-lg border border-border bg-muted px-3 text-sm font-medium text-foreground transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <FiChevronLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          All projects
        </button>
        <div className="rounded-2xl border border-dashed border-border bg-primary/60 px-6 py-16 text-center">
          <p className="text-sm font-medium text-foreground">
            {isError ? "Couldn't load this recording" : "Recording not found"}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            {isError
              ? "Check your connection and try again."
              : "It may have been deleted or you may no longer have access."}
          </p>
        </div>
      </div>
    );
  }

  const outputs = rec.outputs ?? {};
  const screenVideoKind: ScreenOutputKind | null = outputs.both?.key
    ? "both"
    : outputs.screen?.key
      ? "screen"
      : null;
  const recTitle = rec.title || "Untitled recording";
  const isProcessing = rec.status === "STOPPED" || rec.status === "PROCESSING";
  const isFailed = rec.status === "FAILED" && !screenVideoKind;

  const openRename = () => {
    setTitle(recTitle);
    setRenaming(true);
  };

  const submitRename = () => {
    const next = title.trim();
    setRenaming(false);
    if (!next || next === recTitle) return;
    // Optimistic: the hook retitles the cached list instantly.
    renameRecording.mutate({ sessionId: rec.id, title: next });
  };

  const handleDelete = () => {
    // Optimistic: the hook drops it from the cached list right away, so leave
    // for the library immediately and let the request finish in the background
    // (it rolls the card back and toasts if the server rejects it).
    setDeleteConfirmOpen(false);
    navigate("/dashboard/project");
    deleteRecording.mutate(rec.id);
  };

  return (
    <>
      {/* Two-pane on desktop: the page itself never scrolls (it's exactly the
          height of its container), the left pane scrolls on its own, and the
          comments rail runs flush from the header to the bottom edge - hence
          lg:gap-0 + lg:pb-0, with each pane owning its own spacing. Below lg
          the panes stack and the page scrolls normally. */}
      <div className="flex flex-col gap-6 px-2 pb-2 pt-0 lg:h-full lg:min-h-0 lg:gap-0 lg:pb-0">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 pt-2">
          <div className="flex min-w-0 items-center gap-3.5">
            <button
              type="button"
              onClick={() => navigate("/dashboard/project")}
              aria-label="Back to all projects"
              title="All projects"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <FiChevronLeft className="size-5" />
            </button>
            <div className="min-w-0 space-y-0.5">
              <h1 className="truncate text-xl font-semibold leading-tight tracking-[-0.01em] text-foreground">
                {recTitle}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-subtle">
                <span>Screen recording</span>
                {rec.startedAt && (
                  <>
                    <span>·</span>
                    <span>Recorded {formatDay(rec.startedAt)}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div
            role="group"
            aria-label="Recording actions"
            className="flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={openRename}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-muted px-3 text-sm font-medium text-foreground transition-opacity hover:opacity-80 cursor-pointer"
            >
              <FiEdit2 className="size-3.5" />
              Rename
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-danger/10 px-3 text-sm font-medium text-danger transition-colors hover:bg-danger/15 cursor-pointer"
            >
              <FiTrash2 className="size-3.5" />
              Delete
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 lg:min-h-0 lg:overflow-y-auto lg:pt-5">
            {isProcessing && !screenVideoKind ? (
              <section className="flex flex-col gap-4">
                <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl bg-black text-white/60 ring-1 ring-border/50">
                  <FiLoader className="size-6 animate-spin" />
                  <span className="text-sm">Processing your recording…</span>
                  <span className="px-6 text-center text-xs text-white/40">
                    Your screen video will be ready shortly. You can leave this
                    page while it finishes.
                  </span>
                </div>
              </section>
            ) : isFailed ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 bg-primary/60 py-20 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-background text-danger">
                  <FiVideo className="size-6" />
                </span>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Processing failed
                  </p>
                  <p className="text-xs text-fg-subtle">
                    Delete this recording and try again.
                  </p>
                </div>
              </div>
            ) : (
              <section className="flex flex-col gap-4">
                {screenVideoKind ? (
                  <ScreenVideoCard
                    rec={rec}
                    kind={screenVideoKind}
                    onShare={() => setShareOpen(true)}
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-border/50 bg-primary/60 text-sm text-fg-muted">
                    Screen video unavailable
                  </div>
                )}
              </section>
            )}
          </div>
          <div className="min-h-[320px] overflow-hidden rounded-2xl border border-border/50 bg-primary [&>section]:bg-primary lg:my-5 lg:min-h-0">
            <RecordingComments
              comments={comments ?? []}
              isLoading={areCommentsLoading}
              isPosting={createComment.isPending}
              onSubmit={({ body }) => createComment.mutate(body)}
              onDelete={(commentId) => deleteComment.mutate(commentId)}
              // The recording's owner is viewing, so every comment is theirs to
              // moderate.
              canDelete={() => true}
            />
          </div>
        </div>
      </div>
      {shareOpen && (
        <ShareDialog rec={rec} onClose={() => setShareOpen(false)} />
      )}
      {renaming && (
        <RenameDialog
          heading="Rename recording"
          value={title}
          placeholder="Recording name"
          onChange={setTitle}
          onCancel={() => setRenaming(false)}
          onSave={submitRename}
        />
      )}
      {deleteConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-screen-recording-title"
          aria-describedby="delete-screen-recording-description"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-2xl border border-border/50 bg-[#f9f9fb] p-5 animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-[#0f0f11]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id="delete-screen-recording-title"
              className="text-base font-semibold text-foreground"
            >
              Delete this recording?
            </h2>
            <p
              id="delete-screen-recording-description"
              className="mt-1.5 text-sm leading-6 text-fg-muted"
            >
              <span className="font-medium text-foreground">{recTitle}</span>{" "}
              and its recorded media will be permanently deleted. This action
              cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="h-9 rounded-lg bg-muted px-3.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 cursor-pointer"
              >
                Keep recording
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="h-9 rounded-lg bg-danger px-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-85 cursor-pointer"
              >
                Delete recording
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScreenProjectDetail;
