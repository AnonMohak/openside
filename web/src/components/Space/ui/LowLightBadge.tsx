import { Sun } from "lucide-react";
import { cn } from "@/lib/utils";

const LowLightBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      "flex items-center gap-1 rounded-md bg-black/55 px-2 py-0.5 text-[0.7rem] font-medium text-amber-300 backdrop-blur-sm",
      className,
    )}
  >
    <Sun className="size-3" />
    Low light - try facing a light
  </span>
);

export default LowLightBadge;
