import { useState } from "react";
import { toast } from "@/lib/toast";
import { useUpdateSpace } from "@/hooks/useSpace";

const MAX_TITLE_LENGTH = 100;

/**
 * The space title on the pre-join screen. The host can click it to rename the
 * space; Enter or blur saves, Esc cancels. Everyone else sees plain text.
 */
const EditableSpaceTitle = ({
  spaceId,
  title,
  canEdit,
  fallback,
}: {
  spaceId: string;
  title: string;
  canEdit: boolean;
  fallback: string;
}) => {
  const updateSpace = useUpdateSpace(spaceId);
  const [draft, setDraft] = useState<string | null>(null);
  // Shown from the moment of save until the mutation settles, so the old title
  // never flashes while the cache update is still on its way.
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const shownTitle = pendingTitle ?? title;

  if (!canEdit) {
    return <h1 className="text-xl font-semibold">{title || fallback}</h1>;
  }

  const save = () => {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (!next || next === shownTitle) return;
    setPendingTitle(next);
    updateSpace.mutate(
      { title: next },
      {
        onError: () => toast.error("Couldn't rename the space."),
        onSettled: () => setPendingTitle(null),
      },
    );
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") setDraft(null);
        }}
        aria-label="Space title"
        className="w-full bg-transparent p-0 text-xl font-semibold text-foreground outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setDraft(shownTitle)}
      title="Rename space"
      className="flex max-w-full cursor-text items-center text-left"
    >
      <h1 className="min-w-0 truncate text-xl font-semibold">
        {shownTitle || fallback}
      </h1>
    </button>
  );
};

export default EditableSpaceTitle;
