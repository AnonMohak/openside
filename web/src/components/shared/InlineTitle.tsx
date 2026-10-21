import { useLayoutEffect, useRef } from "react";

/**
 * A title you rename by clicking it and typing - no input box, no dialog.
 * Enter or clicking away saves, Esc reverts. Read-only without `onSave`.
 */
const InlineTitle = ({
  value,
  onSave,
  maxLength = 120,
  className = "",
}: {
  value: string;
  onSave?: (next: string) => void;
  maxLength?: number;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const editable = !!onSave;

  // The text lives in the DOM (not React children) so typing never fights a
  // re-render. Sync it from props whenever we're not mid-edit.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.textContent = value;
  }, [value, editable]);

  if (!onSave) return <span className={`block ${className}`}>{value}</span>;

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = 0;
    const next = (el.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxLength);
    el.textContent = next || value;
    if (next && next !== value) onSave(next);
  };

  return (
    <span
      ref={ref}
      role="textbox"
      aria-label="Title"
      contentEditable="plaintext-only"
      spellCheck={false}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.stopPropagation();
          event.currentTarget.textContent = value;
          event.currentTarget.blur();
        }
      }}
      className={`block cursor-text outline-none focus:text-clip ${className}`}
    />
  );
};

export default InlineTitle;
