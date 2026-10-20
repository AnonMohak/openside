import { useState } from "react";
import { Crown } from "lucide-react";
import { useUsage } from "@/hooks/useUsage";
import PricingModal from "./PricingModal";

/**
 * Nudge to upgrade, shown on the dashboard home. Free (demo) users only -
 * pro and self-host plans never see it. Plan comes straight from the server.
 * Not dismissible: free users always see it until they upgrade.
 */
const UpgradeBanner = () => {
  const { data: usage } = useUsage();
  const [pricingOpen, setPricingOpen] = useState(false);

  // Only free users get the nudge; pro/self-host already have what this offers.
  if (usage?.plan !== "demo") return null;

  return (
    <div className="flex w-full items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-500">
          <Crown size={14} className="fill-current" />
        </span>
        <p className="min-w-0 truncate text-sm text-foreground">
          <span className="font-semibold">Subscribe to Pro</span>
          <span className="text-fg-muted max-sm:hidden">
            {" "}
            · 20 hrs/mo, no watermark, 4K, cloud backup, and 30-day retention
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPricingOpen(true)}
        className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Upgrade
      </button>

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />
    </div>
  );
};

export default UpgradeBanner;
