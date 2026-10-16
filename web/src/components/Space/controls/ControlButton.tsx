import React from "react";

interface ControlButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  variant?: "default" | "danger" | "active" | "record";
  className?: string;
  showLabel?: boolean;
  disabled?: boolean;
  iconText?: string;
}

const ControlButton: React.FC<ControlButtonProps> = ({
  icon,
  label,
  onClick,
  variant = "default",
  className = "",
  showLabel = true,
  disabled = false,
  iconText
}) => {
  const handleClick = () => {
    if (onClick && !disabled) {
      onClick();
    }
  };

  const getVariantClasses = () => {
    switch (variant) {
      case "danger":
        return "border-red-500 bg-red-500 text-white hover:border-red-600 hover:bg-red-600";
      case "active":
        return "bg-muted hover:bg-muted/80";
      case "record":
        return "bg-red-400 text-white hover:bg-red-400/80 py-3 px-4";
      default:
        return "bg-primary hover:bg-muted";
    }
  };

  const baseClasses =
    variant === "record"
      ? "flex gap-1.5 items-center justify-center rounded-xl font-medium text-sm cursor-pointer transition-all duration-200"
      : "flex items-center justify-center border border-border p-2.5 md:p-3 rounded-xl text-lg font-medium cursor-pointer transition-all duration-200";

  return (
    <div className="flex flex-col gap-1 items-center">
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`${baseClasses} ${getVariantClasses()} ${className} ${disabled ? "cursor-not-allowed !border-dashed !border-foreground/20 !bg-transparent !text-foreground/30" : ""}`}
      >
        {icon}
        {variant === "record" && iconText && <span>{iconText}</span>}
      </button>
      {showLabel && (
        <p
          className={`text-[0.675rem] max-md:hidden ${
            disabled ? "text-foreground/30" : "text-foreground/50"
          }`}
        >
          {label}
        </p>
      )}
    </div>
  );
};

export default ControlButton;
