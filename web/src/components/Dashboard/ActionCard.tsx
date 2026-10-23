import { ReactNode } from "react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  accentHex?: string; // tints the icon chip; neutral when omitted
  badge?: string; // small pill in the top-right corner, e.g. "Beta"
  onClick?: () => void;
  className?: string; // extra classes for the card (e.g. responsive visibility)
}

const ActionCard = ({
  title,
  description,
  icon,
  accentHex,
  badge,
  onClick,
  className = "",
}: ActionCardProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border bg-white p-4 text-left transition-colors dark:bg-[#232327] dark:hover:bg-[#2a2a2f] ${className}`}
    >
      <span className="flex w-full items-start justify-between">
        <span
          className={`flex size-10 items-center justify-center rounded-lg ${
            accentHex ? "" : "bg-muted text-foreground dark:bg-white/10"
          }`}
          style={
            accentHex
              ? { backgroundColor: `${accentHex}1F`, color: accentHex }
              : undefined
          }
        >
          {icon}
        </span>
        {badge && (
          <span className="absolute right-3 top-3 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-600 ring-1 ring-inset ring-amber-500/25 dark:text-amber-400">
            {badge}
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-fg-muted">{description}</span>
      </span>
    </button>
  );
};

export default ActionCard;
