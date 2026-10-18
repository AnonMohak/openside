import { ReactNode } from "react";

interface ActionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  accentHex?: string; // tints the icon chip; neutral when omitted
  onClick?: () => void;
  className?: string; // extra classes for the card (e.g. responsive visibility)
}

const ActionCard = ({
  title,
  description,
  icon,
  accentHex,
  onClick,
  className = "",
}: ActionCardProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-colors dark:bg-[#232327] dark:hover:bg-[#2a2a2f] ${className}`}
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
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-xs text-fg-muted">{description}</span>
      </span>
    </button>
  );
};

export default ActionCard;
