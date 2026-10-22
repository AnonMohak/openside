import { useEffect, useLayoutEffect, useRef, useState } from "react";

const DESCRIPTION_MAX_LENGTH = 2000;

/**
 * A recording's description, shown under the video. With `onSave` the owner
 * just clicks the text and types - no box, no buttons. Clicking away saves,
 * Esc reverts. Read-only viewers see nothing when it's empty.
 */
const RecordingDescription = ({
  value,
  onSave,
}: {
  value: string | null;
  onSave?: (next: string) => void;
}) => {
  const text = value?.trim() ?? "";
  const [draft, setDraft] = useState(text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Follow outside changes (e.g. a refetch) unless the owner is mid-edit.
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) setDraft(text);
  }, [text]);

  // Grow with the text so it reads like a paragraph, never a scroll box.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  if (!onSave) {
    if (!text) return null;
    return (
      <section className="mt-5 border-t border-border/60 pt-4">
        <h3 className="mb-2 text-base font-semibold text-foreground">
          Description
        </h3>
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-muted">
          {text}
        </p>
      </section>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(next);
    if (next !== text) onSave(next);
  };

  return (
    <section className="mt-5 border-t border-border/60 pt-4">
      <h3 className="mb-2 text-base font-semibold text-foreground">
        Description
      </h3>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            const el = event.currentTarget;
            setDraft(text);
            // Blur after the revert renders, so the blur-save sees no change.
            requestAnimationFrame(() => el.blur());
          } else if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
        rows={1}
        maxLength={DESCRIPTION_MAX_LENGTH}
        placeholder="Add a description…"
        aria-label="Description"
        spellCheck={false}
        className="block w-full resize-none overflow-hidden bg-transparent p-0 text-sm leading-relaxed text-fg-muted outline-none placeholder:text-fg-faint focus:text-foreground"
      />
    </section>
  );
};

export default RecordingDescription;
