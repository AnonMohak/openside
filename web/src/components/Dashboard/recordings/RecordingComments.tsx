/**
 * Comment panel for a recording. Presentational: the owner's project page and
 * the public share page both render this, passing their own data + submit
 * handler (the two talk to different endpoints).
 *
 * Anonymous share-link visitors have no account, so they type a display name
 * once; it's remembered locally so they don't retype it on every comment.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";
import { useTheme } from "next-themes";
import {
  FiArrowUp,
  FiCornerDownRight,
  FiCornerUpLeft,
  FiEdit2,
  FiLoader,
  FiMessageSquare,
  FiMoreHorizontal,
  FiSmile,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import {
  isPendingComment,
  type RecordingComment,
} from "@/hooks/useScreenRecordings";
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
const CommentOptions = ({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) => {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Comment options"
          title="Options"
          className={`-my-1 -mr-1.5 ml-auto flex size-6 shrink-0 items-center justify-center rounded-md transition-all hover:bg-background hover:text-foreground focus-visible:opacity-100 group-hover/comment:opacity-100 cursor-pointer ${
            open
              ? "bg-background text-foreground opacity-100"
              : "text-fg-subtle opacity-0"
          }`}
        >
          <FiMoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <FiEdit2 />
            Edit
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem
            onSelect={onDelete}
            className="text-danger focus:bg-danger/10 focus:text-danger [&_svg]:!text-danger"
          >
            <FiTrash2 />
            Delete
          </DropdownMenuItem>
        )}
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

/**
 * Inline editor for a message. Enter saves, Shift+Enter breaks the line, Esc
 * cancels.
 */
const EditComposer = ({
  initialValue,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const submit = () => {
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-border/50 bg-background">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        rows={2}
        maxLength={2000}
        aria-label="Edit comment"
        className="block w-full resize-none bg-transparent px-2.5 pt-2 text-sm leading-relaxed text-foreground outline-none"
      />
      <div className="flex items-center justify-end gap-1.5 px-2 pb-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-7 rounded-md bg-muted px-2.5 text-xs font-medium text-foreground transition-opacity hover:opacity-80 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed}
          className="h-7 rounded-md bg-brand px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Save
        </button>
      </div>
    </div>
  );
};

/** A one-line quote of the message a reply answers. */
const QuotedMessage = ({
  comment,
  onClick,
}: {
  comment: RecordingComment;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    title="Jump to message"
    className="mb-1 flex w-full min-w-0 flex-col rounded-md border-l-2 border-brand/60 bg-muted/40 px-2 py-1 text-left transition-colors hover:bg-muted/70 cursor-pointer"
  >
    <span className="truncate text-[0.7rem] font-semibold text-fg-muted">
      {comment.authorName}
    </span>
    <span className="line-clamp-1 break-all text-xs text-fg-subtle">
      {comment.body}
    </span>
  </button>
);

const CommentItem = ({
  comment,
  quoted,
  highlighted,
  onJumpToQuoted,
  onSeek,
  onReply,
  onEdit,
  onDelete,
}: {
  comment: RecordingComment;
  /** The message this one replies to, when it still exists. */
  quoted?: RecordingComment;
  highlighted: boolean;
  onJumpToQuoted: () => void;
  onSeek?: (timestampMs: number) => void;
  onReply: () => void;
  onEdit?: (body: string) => void;
  onDelete?: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const pending = isPendingComment(comment);

  const timestamp = comment.timestampMs != null && (
    <button
      type="button"
      disabled={!onSeek}
      onClick={() => onSeek?.(comment.timestampMs as number)}
      title={`Play from ${formatPosition(comment.timestampMs)}`}
      className="shrink-0 text-xs font-medium tabular-nums text-blue-500 hover:underline disabled:cursor-default disabled:no-underline cursor-pointer"
    >
      {formatPosition(comment.timestampMs)}
    </button>
  );

  return (
    <div
      id={`comment-${comment.id}`}
      className={`group/comment flex items-start gap-3 transition-opacity ${
        pending ? "opacity-60" : ""
      }`}
    >
      <Avatar comment={comment} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <EditComposer
            initialValue={comment.body}
            onCancel={() => setEditing(false)}
            onSubmit={(body) => {
              setEditing(false);
              if (body !== comment.body) onEdit?.(body);
            }}
          />
        ) : (
          <>
            {quoted && (
              // Outside the bubble: what this answers, then who it answers.
              <>
                <QuotedMessage comment={quoted} onClick={onJumpToQuoted} />
                <p className="mb-1 ml-1 flex items-center gap-1 text-xs text-fg-subtle">
                  <FiCornerDownRight className="size-3 shrink-0" />
                  <span className="truncate">
                    Replied to{" "}
                    <span className="font-medium text-fg-muted">
                      {quoted.authorName}
                    </span>
                  </span>
                </p>
              </>
            )}
            <div
              // Sharp top-left corner with a small tail pointing at the avatar.
              className={`relative rounded-xl rounded-tl-none px-3 py-2 transition-colors duration-500 before:absolute before:-left-1.5 before:top-0 before:size-1.5 before:bg-inherit before:content-[''] before:[clip-path:polygon(0_0,100%_0,100%_100%)] ${
                highlighted ? "bg-brand/15" : "bg-muted/60"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {comment.authorName}
                </span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {formatWhen(comment.createdAt)}
                  {comment.editedAt && " · edited"}
                </span>
                {timestamp}
                {!pending && (onEdit || onDelete) && (
                  <CommentOptions
                    onEdit={onEdit ? () => setEditing(true) : undefined}
                    onDelete={onDelete}
                  />
                )}
              </div>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/80">
                {comment.body}
              </p>
            </div>
            {!pending && (
              <button
                type="button"
                onClick={onReply}
                className="ml-1 mt-1 flex items-center gap-1 text-xs font-medium text-fg-subtle transition-colors hover:text-foreground cursor-pointer"
              >
                <FiCornerUpLeft className="size-3" />
                Reply
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface RecordingCommentsProps {
  comments: RecordingComment[];
  isLoading?: boolean;
  /** Anonymous visitors (share page, signed out) must name themselves. */
  askForName?: boolean;
  onSubmit: (input: {
    body: string;
    authorName?: string;
    timestampMs: number | null;
    /** Set for replies: the message being answered. */
    parentId?: string;
  }) => void;
  /** Where the viewer is in the video (ms), stamped onto a new comment. */
  getTimestampMs?: () => number | null;
  /** Clicking a comment's timestamp plays the video from there. */
  onSeek?: (timestampMs: number) => void;
  onEdit?: (commentId: string, body: string) => void;
  /** Which comments the viewer may edit (their own). */
  canEdit?: (comment: RecordingComment) => boolean;
  onDelete?: (commentId: string) => void;
  /** Which comments show a delete affordance (own comment, or owner moderating). */
  canDelete?: (comment: RecordingComment) => boolean;
}

/** Within this many px of the bottom, new messages keep the list pinned there. */
const STICK_TO_BOTTOM_PX = 80;

const RecordingComments = ({
  comments,
  isLoading = false,
  askForName = false,
  onSubmit,
  getTimestampMs,
  onSeek,
  onEdit,
  canEdit,
  onDelete,
  canDelete,
}: RecordingCommentsProps) => {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [replyingTo, setReplyingTo] = useState<RecordingComment | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const highlightTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (askForName) setName(readGuestName());
  }, [askForName]);

  useEffect(
    () => () => {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
    },
    [],
  );

  // Chat behaviour: open at the latest message, and follow new ones while the
  // viewer is at the bottom (or just sent one themselves).
  const lastComment = comments[comments.length - 1];
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !lastComment) return;
    if (nearBottomRef.current || isPendingComment(lastComment)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lastComment?.id, isLoading]);

  // A quoted message that was deleted simply isn't shown.
  const byId = new Map(comments.map((comment) => [comment.id, comment]));

  const trimmedBody = body.trim();
  const trimmedName = name.trim();
  const canPost = !!trimmedBody && (!askForName || !!trimmedName);

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

  const startReply = (comment: RecordingComment) => {
    setReplyingTo(comment);
    textareaRef.current?.focus();
  };

  const jumpTo = (commentId: string) => {
    document
      .getElementById(`comment-${commentId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(commentId);
    if (highlightTimerRef.current) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(
      () => setHighlightedId(null),
      1400,
    );
  };

  const submit = () => {
    if (!canPost) return;
    if (askForName) rememberGuestName(trimmedName);
    onSubmit({
      body: trimmedBody,
      authorName: askForName ? trimmedName : undefined,
      timestampMs: getTimestampMs?.() ?? null,
      parentId: replyingTo?.id,
    });
    setBody("");
    setReplyingTo(null);
  };

  return (
    // Plain background, no card chrome: this is a full-height rail flush to the
    // header and the bottom, so the surrounding layout owns any divider.
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <h3 className="text-sm font-semibold text-foreground">Comments</h3>
      </div>

      <div
        ref={listRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <
            STICK_TO_BOTTOM_PX;
        }}
        className="flex min-h-[160px] flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center text-fg-subtle">
            <FiLoader className="size-4 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
            <span className="flex items-center justify-center text-fg-subtle">
              <FiMessageSquare className="size-6" />
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
          comments.map((comment) => {
            const quoted = comment.parentId
              ? byId.get(comment.parentId)
              : undefined;
            return (
              <CommentItem
                key={comment.id}
                comment={comment}
                quoted={quoted}
                highlighted={highlightedId === comment.id}
                onJumpToQuoted={() => quoted && jumpTo(quoted.id)}
                onSeek={onSeek}
                onReply={() => startReply(comment)}
                onEdit={
                  onEdit && canEdit?.(comment)
                    ? (next) => onEdit(comment.id, next)
                    : undefined
                }
                onDelete={
                  onDelete && canDelete?.(comment)
                    ? () => {
                        if (replyingTo?.id === comment.id) setReplyingTo(null);
                        onDelete(comment.id);
                      }
                    : undefined
                }
              />
            );
          })
        )}
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background">
          {replyingTo && (
            <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border-l-2 border-brand bg-muted/60 py-1.5 pl-2.5 pr-1.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-150">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-xs font-semibold text-brand">
                  <FiCornerUpLeft className="size-3 shrink-0" />
                  <span className="truncate">
                    Replying to {replyingTo.authorName}
                  </span>
                </p>
                <p className="mt-0.5 line-clamp-1 break-all text-xs text-fg-muted">
                  {replyingTo.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                aria-label="Cancel reply"
                title="Cancel reply"
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-background hover:text-foreground cursor-pointer"
              >
                <FiX className="size-3.5" />
              </button>
            </div>
          )}
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
              // Enter posts; Shift+Enter starts a new line; Esc drops a reply.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape" && replyingTo) {
                event.preventDefault();
                setReplyingTo(null);
              }
            }}
            rows={2}
            maxLength={2000}
            placeholder={
              replyingTo
                ? `Reply to ${replyingTo.authorName}…`
                : "Write a comment…"
            }
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
              <FiArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

/** Loading stand-in for the comments rail: header, chat bubbles, composer. */
export const RecordingCommentsSkeleton = () => (
  <>
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
      <div className="h-4 w-20 animate-pulse rounded-md bg-muted" />
    </div>
    {/* Chat bubbles, the last one a reply quoting an earlier message */}
    <div className="flex flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
      {[
        { body: ["w-full", "w-2/3"] },
        { body: ["w-4/5"] },
        { body: ["w-3/4"], reply: true },
      ].map((bubble, index) => (
        <div key={index} className="flex items-start gap-3">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1">
            {bubble.reply && (
              <>
                <div className="mb-1 h-10 animate-pulse rounded-md bg-muted/40" />
                <div className="mb-1 ml-1 h-3 w-24 animate-pulse rounded-md bg-muted/60" />
              </>
            )}
            <div className="space-y-2 rounded-xl rounded-tl-none bg-muted/60 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="h-3.5 w-20 animate-pulse rounded-md bg-muted" />
                <div className="h-3 w-12 animate-pulse rounded-md bg-muted" />
              </div>
              {bubble.body.map((width, line) => (
                <div
                  key={line}
                  className={`h-3 animate-pulse rounded-md bg-muted ${width}`}
                />
              ))}
            </div>
            <div className="ml-1 mt-1.5 h-3 w-10 animate-pulse rounded-md bg-muted/60" />
          </div>
        </div>
      ))}
    </div>
    {/* Composer: text area, then emoji + send */}
    <div className="p-3">
      <div className="rounded-xl border border-border/50 px-3 pb-2.5 pt-3">
        <div className="h-3.5 w-32 animate-pulse rounded-md bg-muted" />
        <div className="mt-6 flex items-center justify-end gap-1.5">
          <div className="size-8 animate-pulse rounded-lg bg-muted" />
          <div className="size-8 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  </>
);

export default RecordingComments;
