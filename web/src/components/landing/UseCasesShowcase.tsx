import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/components/landing/motion";
import type { UseCase } from "@/components/landing/content";

// How long each use case stays up before the showcase advances.
const USE_CASE_INTERVAL_S = 4.5;

// Interactive showcase for "Use cases": a list of scenarios that drives a
// single image panel. It auto-advances when the active progress segment fills
// (paused while hovered), and clicking any item jumps to it.
const UseCasesShowcase = ({ items }: { items: UseCase[] }) => {
  const [active, setActive] = useState(0);
  const current = items[active];

  return (
    <div className="group/showcase mt-10 grid grid-cols-1 gap-3 md:grid-cols-[0.9fr_1.3fr] md:gap-6">
      <div className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {items.map(({ icon: ItemIcon, title }, i) => {
          const isActive = i === active;
          return (
            <button
              key={title}
              type="button"
              onClick={() => setActive(i)}
              aria-pressed={isActive}
              className={`group flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors md:shrink ${
                isActive
                  ? "border-(--landing-brand-text) bg-(--landing-brand-text)/[0.08] text-(--landing-brand-text)"
                  : "border-border bg-background text-foreground/70 hover:border-(--landing-brand-text)/40 hover:text-foreground"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? "bg-[#0041aa] text-white"
                    : "bg-(--landing-chip) text-foreground/70 group-hover:bg-border"
                }`}
              >
                <ItemIcon className="size-4" />
              </span>
              <span className="whitespace-nowrap md:whitespace-normal">
                {title}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-primary sm:aspect-[4/3] md:aspect-auto md:min-h-[30rem]">
        <AnimatePresence>
          <motion.div
            key={current.title}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
            className="absolute inset-0 bg-cover bg-top"
            style={{ backgroundImage: `url(${current.image})` }}
          />
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/5 to-black/40" />


        <div className="absolute inset-x-0 top-0 p-6 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-white/20 backdrop-blur-md">
                {String(active + 1).padStart(2, "0")} /{" "}
                {String(items.length).padStart(2, "0")}
              </span>
              <h3 className="font-bricolage mt-3 text-2xl font-semibold tracking-tight text-white">
                {current.title}
              </h3>
              <p className="mt-2 max-w-md text-[0.9375rem] leading-6 text-white/80">
                {current.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Story-style progress: filled for past items, filling for the
            active one (its animation end advances the showcase). */}
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
          <div className="flex gap-1.5">
            {items.map((item, i) => (
              <span
                key={item.title}
                className="h-1 flex-1 overflow-hidden rounded-full bg-white/30"
              >
                {i < active && <span className="block h-full bg-white" />}
                {i === active && (
                  <span
                    key={active}
                    onAnimationEnd={() =>
                      setActive((a) => (a + 1) % items.length)
                    }
                    className="block h-full origin-left bg-white animate-[usecase-progress_linear_forwards] group-hover/showcase:[animation-play-state:paused]"
                    style={{ animationDuration: `${USE_CASE_INTERVAL_S}s` }}
                  />
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UseCasesShowcase;
