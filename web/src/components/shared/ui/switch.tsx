import { cn } from "@/lib/utils";

/** On/off switch used across the settings screens. */
const Switch = ({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
      checked ? "bg-success" : "bg-fg-faint",
      disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
    )}
  >
    <span
      className={cn(
        "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
        checked ? "translate-x-5" : "translate-x-0.5",
      )}
    />
  </button>
);

export default Switch;
