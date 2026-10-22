/**
 * Comment panel for a recording. Presentational: the owner's project page and
 * the public share page both render this, passing their own data + submit
 * handler (the two talk to different endpoints).
 *
 * Anonymous share-link visitors have no account, so they type a display name
 * once; it's remembered locally so they don't retype it on every comment.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import {
  FiArrowUp,
  FiLoader,
  FiMessageSquare,
  FiMoreHorizontal,
  FiSmile,
  FiTrash2,
} from "react-icons/fi";
import type { RecordingComment } from "@/hooks/useScreenRecordings";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shared/ui/dropdown-menu";

const GUEST_NAME_KEY = "openside:guest-comment-name";

const readGuestName = (): string => {
  try {
    return localStorage.getItem(GUEST_NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

const rememberGuestName = (name: string) => {
  try {
    localStorage.setItem(GUEST_NAME_KEY, name);
  } catch {
    // Private mode / storage disabled - the name just won't persist.
  }
};

const formatPosition = (ms: number) => {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
};

const formatWhen = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const PICKER_WIDTH = 320;
const PICKER_HEIGHT = 380;

// Full emoji picker in a popover above the button. Portaled so the comment
// rail's overflow can't clip it; stays open so several can be added in a row.
const EmojiButton = ({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) => {
  const { resolvedTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ bottom: number; left: number } | null>(
    null,
  );

  const close = () => {
    setAnchor(null);
    onClose();
  };

  const toggle = () => {
    if (anchor) return close();
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({
      bottom: window.innerHeight - rect.top + 8,
      left: Math.max(
        8,
        Math.min(
          rect.right - PICKER_WIDTH,
          window.innerWidth - PICKER_WIDTH - 8,
        ),
      ),
    });
  };

  useEffect(() => {
    if (!anchor) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        panelRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onResize = () => close();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label="Add emoji"
        aria-expanded={!!anchor}
        title="Emoji"
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted hover:text-foreground cursor-pointer ${
          anchor ? "bg-muted text-foreground" : "text-fg-subtle"
        }`}
      >
        <FiSmile className="size-4" />
      </button>
      {anchor &&
        createPortal(
          <div
            ref={panelRef}
            style={{ bottom: anchor.bottom, left: anchor.left }}
            className="fixed z-[100] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 duration-150"
          >
            <EmojiPicker
              width={PICKER_WIDTH}
              height={PICKER_HEIGHT}
              theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              lazyLoadEmojis
              previewConfig={{ showPreview: false }}
              skinTonesDisabled
              onEmojiClick={(data) => onPick(data.emoji)}
            />
          </div>,
          document.body,
        )}
    </>
  );
};

// Revealed on hover; stays visible while its menu is open.
const CommentOptions = ({ onDelete }: { onDelete: () => void }) => {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Comment options"
          title="Options"
          className={`-my-1 -mr-1.5 ml-auto flex size-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer ${
            open
              ? "bg-background text-foreground opacity-100"
              : "text-fg-subtle opacity-0"
          }`}
        >
          <FiMoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onSelect={onDelete}
          className="text-danger focus:bg-danger/10 focus:text-danger [&_svg]:!text-danger"
        >
          <FiTrash2 />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const Avatar = ({ comment }: { comment: RecordingComment }) => {
  const [failed, setFailed] = useState(false);
  const avatar = comment.user?.avatar;
  const initial = (comment.authorName.trim()[0] || "?").toUpperCase();

  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand text-xs font-semibold text-white">
      {avatar && !failed ? (
        <img
          src={avatar}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initial
      )}
    </span>
  );
};

interface RecordingCommentsProps {
  comments: RecordingComment[];
  isLoading?: boolean;
  isPosting?: boolean;
  /** Anonymous visitors (share page, signed out) must name themselves. */
  askForName?: boolean;
  onSubmit: (input: {
    body: string;
    authorName?: string;
    timestampMs: number | null;
  }) => void;
  /** Where the viewer is in the video (ms), stamped onto a new comment. */
  getTimestampMs?: () => number | null;
  /** Clicking a comment's timestamp plays the video from there. */
  onSeek?: (timestampMs: number) => void;
  onDelete?: (commentId: string) => void;
  /** Which comments show a delete affordance (own comment, or owner moderating). */
  canDelete?: (comment: RecordingComment) => boolean;
}

const RecordingComments = ({
  comments,
  isLoading = false,
  isPosting = false,
  askForName = false,
  onSubmit,
  getTimestampMs,
  onSeek,
  onDelete,
  canDelete,
}: RecordingCommentsProps) => {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (askForName) setName(readGuestName());
  }, [askForName]);

  const trimmedBody = body.trim();
  const trimmedName = name.trim();
  const canPost = !!trimmedBody && (!askForName || !!trimmedName) && !isPosting;

  // Drop the emoji at the caret (or over the selection), then park the caret
  // after it.
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + emoji + body.slice(end);
    if (next.length > 2000) return;
    setBody(next);
    requestAnimationFrame(() => {
      const caret = start + emoji.length;
      el?.setSelectionRange(caret, caret);
    });
  };

  const submit = () => {
    if (!canPost) return;
    if (askForName) rememberGuestName(trimmedName);
    onSubmit({
      body: trimmedBody,
      authorName: askForName ? trimmedName : undefined,
      timestampMs: getTimestampMs?.() ?? null,
    });
    setBody("");
  };

  return (
    // Plain background, no card chrome: this is a full-height rail flush to the
    // header and the bottom, so the surrounding layout owns any divider.
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-foreground">Comments</h3>
      </div>

      <div className="flex min-h-[160px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-fg-subtle">
            <FiLoader className="size-4 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-muted text-fg-muted">
              <FiMessageSquare className="size-5" />
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-foreground">
                No comments yet
              </p>
              <p className="text-xs text-fg-subtle">
                Be the first to leave feedback.
              </p>
            </div>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="group flex items-start gap-3">
              <Avatar comment={comment} />
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-muted/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {comment.authorName}
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {formatWhen(comment.createdAt)}
                  </span>
                  {comment.timestampMs != null && (
                    <button
                      type="button"
                      disabled={!onSeek}
                      onClick={() => onSeek?.(comment.timestampMs as number)}
                      title={`Play from ${formatPosition(comment.timestampMs)}`}
                      className="shrink-0 text-xs font-medium tabular-nums text-blue-500 hover:underline disabled:cursor-default disabled:no-underline cursor-pointer"
                    >
                      {formatPosition(comment.timestampMs)}
                    </button>
                  )}
                  {onDelete && canDelete?.(comment) && (
                    <CommentOptions onDelete={() => onDelete(comment.id)} />
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
                  {comment.body}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background">
          {askForName && (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Your name"
              aria-label="Your name"
              className="h-10 w-full border-b border-border/50 bg-transparent px-3 text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-fg-faint"
            />
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              // Enter posts; Shift+Enter starts a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder="Write a comment…"
            aria-label="Comment"
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-fg-faint"
          />
          <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
            <span className="mr-auto text-[0.7rem] tabular-nums text-fg-faint">
              {body.length > 1800 ? `${body.length}/2000` : null}
            </span>
            <EmojiButton
              onPick={insertEmoji}
              onClose={() => textareaRef.current?.focus()}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canPost}
              aria-label="Post comment"
              title="Post comment"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {isPosting ? (
                <FiLoader className="size-4 animate-spin" />
              ) : (
                <FiArrowUp className="size-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default RecordingComments;
