/** Small modal for renaming a project or recording. Enter saves, Esc cancels. */
const RenameDialog = ({
  heading,
  description,
  value,
  placeholder,
  maxLength = 120,
  onChange,
  onCancel,
  onSave,
}: {
  heading: string;
  description?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) => {
  const canSave = value.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm animate-in fade-in-0 duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rename-dialog-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-[420px] rounded-2xl border border-border/50 bg-[#f9f9fb] p-5 animate-in fade-in-0 zoom-in-95 duration-150 dark:bg-[#0f0f11]"
        onClick={(event) => event.stopPropagation()}
      >
        <div>
          <div className="min-w-0">
            <h2
              id="rename-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              {heading}
            </h2>
            {description && (
              <p className="mt-0.5 text-sm text-fg-muted">{description}</p>
            )}
          </div>
        </div>

        <label className="mt-5 flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-fg-muted">
            Name
            <span className="font-normal tabular-nums text-fg-subtle">
              {value.length}/{maxLength}
            </span>
          </span>
          <input
            autoFocus
            value={value}
            maxLength={maxLength}
            onChange={(event) => onChange(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canSave) onSave();
              if (event.key === "Escape") onCancel();
            }}
            placeholder={placeholder}
            className="h-10 w-full rounded-lg border border-border/50 bg-primary px-3 text-sm text-foreground outline-none transition-colors placeholder:text-fg-faint focus:border-fg-faint"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-lg bg-muted px-3.5 text-sm font-medium text-foreground transition-opacity hover:opacity-80 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="h-9 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default RenameDialog;
