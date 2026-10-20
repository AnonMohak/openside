import { useEffect, useRef, useState } from "react";
import { Check, Copy, Globe, Loader2 } from "lucide-react";
import { backdropMotion, panelMotion } from "@/hooks/usePresence";

/**
 * Share a recording by public link, link-first: opening the dialog creates the
 * link if there isn't one yet (the share endpoints are idempotent), so it's
 * ready to copy straight away. "Stop sharing" revokes it and closes.
 */
const ShareLinkDialog = ({
  recordingTitle,
  url,
  accessNote,
  isStopping,
  onCreate,
  onStop,
  onClose,
  isClosing = false,
}: {
  recordingTitle?: string;
  /** The public URL, or null until it's been created. */
  url: string | null;
  /** What a link holder can do, e.g. "watch and download". */
  accessNote: string;
  isStopping: boolean;
  onCreate: () => void;
  onStop: () => void;
  onClose: () => void;
  /** Playing the exit animation (see usePresence). */
  isClosing?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const requestedRef = useRef(false);

  // Mint the link on open - once, even if the dialog re-renders meanwhile.
  useEffect(() => {
    if (url || requestedRef.current) return;
    requestedRef.current = true;
    onCreate();
  }, [url, onCreate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked - the field stays selectable for a manual copy.
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm ${backdropMotion(isClosing)}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-link-title"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[480px] rounded-2xl border border-border/50 bg-[#f9f9fb] p-5 dark:bg-[#0f0f11] ${panelMotion(isClosing)}`}
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="share-link-title"
          className="text-base font-semibold text-foreground"
        >
          Share recording
        </h2>
        {recordingTitle && (
          <p className="mt-0.5 truncate text-sm text-fg-muted">
            {recordingTitle}
          </p>
        )}

        <div className="mt-5 flex h-12 items-center gap-2 rounded-xl border border-border/50 bg-primary p-1.5 pl-3.5">
          {url ? (
            <input
              readOnly
              value={url}
              onFocus={(event) => event.currentTarget.select()}
              aria-label="Share link"
              className="min-w-0 flex-1 truncate bg-transparent text-sm text-foreground outline-none"
            />
          ) : (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg-subtle">
              <Loader2 size={14} className="animate-spin" />
              Creating link…
            </span>
          )}
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!url}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer ${
              copied
                ? "bg-success/10 text-success"
                : "bg-brand text-white hover:opacity-90"
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 px-0.5 text-xs text-fg-subtle">
          <Globe size={13} className="shrink-0" />
          Anyone with the link can {accessNote}.
        </p>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onStop}
            disabled={!url || isStopping}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-danger/10 px-3.5 text-sm font-medium text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            {isStopping && <Loader2 size={14} className="animate-spin" />}
            Stop sharing
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-85 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareLinkDialog;
