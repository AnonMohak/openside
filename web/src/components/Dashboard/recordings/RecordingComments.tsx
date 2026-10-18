/**
 * Comment panel for a recording. Presentational: the owner's project page and
 * the public share page both render this, passing their own data + submit
 * handler (the two talk to different endpoints).
 *
 * Anonymous share-link visitors have no account, so they type a display name
 * once; it's remembered locally so they don't retype it on every comment.
 */

import { useEffect, useState } from "react";
import { FiArrowUp, FiLoader, FiMessageSquare, FiTrash2 } from "react-icons/fi";
import type { RecordingComment } from "@/hooks/useScreenRecordings";

const GUEST_NAME_KEY = "openside:guest-comment-name";

export const readGuestName = (): string => {
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
  onSubmit: (input: { body: string; authorName?: string }) => void;
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
  onDelete,
  canDelete,
}: RecordingCommentsProps) => {
  const [body, setBody] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (askForName) setName(readGuestName());
  }, [askForName]);

  const trimmedBody = body.trim();
  const trimmedName = name.trim();
  const canPost = !!trimmedBody && (!askForName || !!trimmedName) && !isPosting;

  const submit = () => {
    if (!canPost) return;
    if (askForName) rememberGuestName(trimmedName);
    onSubmit({
      body: trimmedBody,
      authorName: askForName ? trimmedName : undefined,
    });
    setBody("");
  };

  return (
    // Plain background, no card chrome: this is a full-height rail flush to the
    // header and the bottom, so the surrounding layout owns any divider.
    <section className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-foreground">Comments</h3>
        {!isLoading && comments.length > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-fg-muted">
            {comments.length}
          </span>
        )}
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
                  {onDelete && canDelete?.(comment) && (
                    <button
                      type="button"
                      onClick={() => onDelete(comment.id)}
                      aria-label="Delete comment"
                      title="Delete comment"
                      className="-my-1 -mr-1.5 ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-fg-subtle opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
                    >
                      <FiTrash2 className="size-3.5" />
                    </button>
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

      <div className="border-t border-border/50 p-3">
        <div className="overflow-hidden rounded-xl border border-border/50 bg-background transition-colors focus-within:border-fg-faint">
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
          <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
            <span className="text-[0.7rem] tabular-nums text-fg-faint">
              {body.length > 1800 ? `${body.length}/2000` : null}
            </span>
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
