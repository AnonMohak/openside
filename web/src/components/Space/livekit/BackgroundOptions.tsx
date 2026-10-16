import type { ReactNode } from "react";
import { Aperture, Ban, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BACKGROUND_PRESETS,
  backgroundKey,
  getPresetImageUrl,
  type CameraBackground,
} from "@/lib/cameraBackgrounds";

interface BackgroundOptionsGridProps {
  value: CameraBackground;
  customImageUrl: string | null;
  /** backgroundKey() of the option still being applied, if any. */
  pendingKey: string | null;
  disabled?: boolean;
  /** Name each option under its thumbnail (roomier layouts like settings). */
  showLabels?: boolean;
  className?: string;
  onSelect: (background: CameraBackground) => void;
  /**
   * Opens the file picker. The <input type="file"> stays with the caller so it
   * can live outside a menu that unmounts when the OS file dialog takes focus.
   */
  onUploadClick: () => void;
}

/** None / blur / presets / your image / upload, as a grid of thumbnails. */
const BackgroundOptionsGrid = ({
  value,
  customImageUrl,
  pendingKey,
  disabled = false,
  showLabels = false,
  className,
  onSelect,
  onUploadClick,
}: BackgroundOptionsGridProps) => {
  const selectedKey = backgroundKey(value);

  const renderOption = (
    option: CameraBackground,
    label: string,
    content: ReactNode,
  ) => {
    const key = backgroundKey(option);
    const isSelected = selectedKey === key;
    const button = (
      <button
        key={key}
        type="button"
        title={label}
        aria-label={label}
        aria-pressed={isSelected}
        disabled={disabled}
        onClick={() => {
          if (!isSelected) onSelect(option);
        }}
        className={cn(
          "relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden border bg-primary text-foreground/70 transition-all hover:text-foreground disabled:opacity-50",
          showLabels ? "rounded-lg" : "rounded-md",
          isSelected
            ? showLabels
              ? "border-brand ring-2 ring-brand ring-offset-2 ring-offset-call-background"
              : "border-brand ring-1 ring-brand"
            : "border-call-border hover:border-foreground/30",
        )}
      >
        {content}
        {pendingKey === key && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 className="size-3.5 animate-spin" />
          </span>
        )}
      </button>
    );
    if (!showLabels) return button;
    return (
      <div key={key} className="flex min-w-0 flex-col gap-1.5">
        {button}
        <span
          className={cn(
            "truncate text-center text-xs",
            isSelected ? "font-medium text-foreground" : "text-foreground/55",
          )}
        >
          {label}
        </span>
      </div>
    );
  };

  const thumbnail = (url: string) => (
    <img src={url} alt="" className="h-full w-full object-cover" />
  );

  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      {renderOption(
        { kind: "none" },
        showLabels ? "None" : "No background",
        <Ban className="size-4" />,
      )}
      {renderOption(
        { kind: "blur" },
        showLabels ? "Blur" : "Blur background",
        showLabels ? (
          <Aperture className="size-4" />
        ) : (
          <span className="text-[0.65rem] font-medium">Blur</span>
        ),
      )}
      {BACKGROUND_PRESETS.map((preset) =>
        renderOption(
          { kind: "preset", id: preset.id },
          preset.label,
          thumbnail(getPresetImageUrl(preset.id)),
        ),
      )}
      {customImageUrl &&
        renderOption(
          { kind: "custom" },
          "Your image",
          thumbnail(customImageUrl),
        )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <button
          type="button"
          title="Upload a background"
          aria-label="Upload a background"
          disabled={disabled}
          onClick={onUploadClick}
          className={cn(
            "flex aspect-[16/10] w-full items-center justify-center border border-dashed border-call-border bg-primary text-foreground/60 transition-colors hover:bg-primary-hover hover:text-foreground disabled:opacity-50",
            showLabels ? "rounded-lg" : "rounded-md",
          )}
        >
          <ImagePlus className="size-4" />
        </button>
        {showLabels && (
          <span className="truncate text-center text-xs text-foreground/55">
            Upload
          </span>
        )}
      </div>
    </div>
  );
};

export default BackgroundOptionsGrid;
