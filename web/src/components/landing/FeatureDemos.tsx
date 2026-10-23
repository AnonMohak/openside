import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  AudioLines,
  Check,
  Download,
  Link2,
  Monitor,
  Share2,
  Video,
} from "lucide-react";
import { BsFillRecordCircleFill, BsFillTelephoneFill } from "react-icons/bs";
import { FiUploadCloud, FiVideo } from "react-icons/fi";
import { LuScreenShare } from "react-icons/lu";
import { RiMicLine } from "react-icons/ri";
import { EASE } from "@/components/landing/motion";

// A single Space-style control: a bordered rounded button with a small caption
// underneath, matching the app's ControlButton look (light landing palette).
const ControlPill = ({
  icon,
  label,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) => (
  <div
    className={`flex items-center justify-center rounded-lg border border-border bg-primary p-2 text-base text-foreground ${className}`}
    aria-label={label}
  >
    {icon}
  </div>
);

// A mock of the Space bottom control bar, used half-cut in the recording card.
// The record button switches to "Stop" and dips on press, driven by the demo.
const SpaceControlBar = ({
  recordLabel = "Record",
  recording = false,
  pressed = false,
}: {
  recordLabel?: string;
  recording?: boolean;
  pressed?: boolean;
}) => (
  <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-background p-1.5 shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
    <motion.div
      animate={{ scale: pressed ? 0.93 : 1 }}
      transition={{ duration: 0.12, ease: EASE }}
      className={`flex min-w-[4.5rem] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium text-white ${
        recording
          ? "border-red-600 bg-red-600"
          : "border-red-500 bg-red-500"
      }`}
    >
      <BsFillRecordCircleFill
        className={`size-3.5 ${recording ? "animate-pulse" : ""}`}
      />
      <span>{recordLabel}</span>
    </motion.div>

    <ControlPill icon={<RiMicLine />} label="Mic" />
    <ControlPill icon={<FiVideo />} label="Cam" />
    <ControlPill icon={<LuScreenShare />} label="Screen" />

    <div className="h-7 w-px bg-border" />

    <ControlPill
      icon={<BsFillTelephoneFill className="-rotate-[225deg]" />}
      label="End"
      className="border-red-500 bg-red-500 text-white"
    />
  </div>
);

// Cursor tip target: the bottom-right of the Record button, relative to the
// control-bar wrapper.
const REC = { x: 74, y: 30 };

// Auto-playing demo for the "High-quality local recording" card: the cursor
// clicks Record → a quick 3·2·1 countdown → the button flips to Stop, a timer
// counts up (bottom-left) and an uploading badge appears (middle) — then loops.
export const LocalRecordingDemo = () => {
  const [phase, setPhase] = useState<"idle" | "click" | "count" | "record">(
    "idle",
  );
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    const push = (t: ReturnType<typeof setTimeout>) => timers.push(t);
    const clearAll = () => {
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      timers.length = 0;
      intervals.length = 0;
    };

    const cycle = () => {
      if (cancelled) return;
      setPhase("idle");
      setCount(3);
      setElapsed(0);
      setPct(0);

      // Cursor glides in, then presses Record.
      push(
        setTimeout(() => {
          setPhase("click");
          push(
            setTimeout(() => {
              // Quick 3 · 2 · 1 countdown.
              setPhase("count");
              setCount(3);
              push(setTimeout(() => setCount(2), 450));
              push(setTimeout(() => setCount(1), 900));
              push(
                setTimeout(() => {
                  // Recording: timer runs, upload progresses.
                  setPhase("record");
                  const start = Date.now();
                  const iv = setInterval(() => {
                    setElapsed(Math.floor((Date.now() - start) / 1000));
                    setPct((p) => Math.min(100, p + 5));
                  }, 260);
                  intervals.push(iv);
                  // Hold, then loop.
                  push(
                    setTimeout(() => {
                      clearAll();
                      cycle();
                    }, 4600),
                  );
                }, 1350),
              );
            }, 280),
          );
        }, 1000),
      );
    };

    cycle();
    return () => {
      cancelled = true;
      clearAll();
    };
  }, []);

  const recording = phase === "record";
  const recordLabel = phase === "count" || recording ? "Stop" : "Record";
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <>
      {/* 4K badge, top-right. */}
      <div className="absolute right-3.5 top-3.5 flex items-center gap-1.5 rounded-lg bg-white/70 px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] backdrop-blur-md">
        <span className="text-base font-semibold leading-none tracking-tight text-[#131313]">
          4K
        </span>
        <span className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-[#131313]/45">
          UHD
        </span>
      </div>


      {/* Middle: the 3·2·1 starter countdown (red, rounded), then the uploading
          badge once recording is underway. */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {phase === "count" && (
          <motion.div
            key={count}
            initial={{ scale: 1.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="flex size-14 items-center justify-center rounded-full bg-red-500 text-3xl font-medium tabular-nums text-white shadow-[0_6px_20px_rgba(239,68,68,0.3)]"
          >
            {count}
          </motion.div>
        )}
        {recording && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex items-center gap-2 rounded-lg bg-white/85 px-4 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.1)] ring-1 ring-black/5 backdrop-blur-md"
          >
            <FiUploadCloud className="size-4 text-[#131313]/70" />
            <span className="text-sm font-medium text-[#131313]">Uploading</span>
            <span className="text-sm font-semibold tabular-nums text-[#3b5bfd]">
              {pct}%
            </span>
          </motion.div>
        )}
      </div>

      {/* Bottom row: the timer (left) and the control bar (right), vertically
          aligned; the bar is half-cut off the right, with the clicking cursor. */}
      <div className="absolute inset-x-0 bottom-4 flex items-center">
        {/* Timer stays put, showing 00:00 until recording starts. */}
        <span className="flex h-11 -translate-x-[20%] items-center rounded-xl bg-white/75 pl-8 pr-5 text-sm font-medium tabular-nums text-[#131313] shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] backdrop-blur-md">
          {mm}:{ss}
        </span>
        <div className="relative ml-auto translate-x-[26%]">
          <SpaceControlBar
            recordLabel={recordLabel}
            recording={recording}
            pressed={phase === "click"}
          />
          <motion.div
            className="pointer-events-none absolute left-0 top-0 z-20"
            initial={{ x: REC.x, y: REC.y + 58, scale: 1, opacity: 0 }}
            animate={{
              x: REC.x,
              y: phase === "count" || recording ? REC.y + 28 : REC.y,
              scale: phase === "click" ? 0.82 : 1,
              opacity: phase === "idle" || phase === "click" ? 1 : 0,
            }}
            transition={{
              duration: phase === "click" ? 0.12 : 0.5,
              ease: EASE,
            }}
          >
            <CursorArrow />
          </motion.div>
        </div>
      </div>
    </>
  );
};

// Live, code-only demo for the "Tracks, downloads, and backup" feature: the tail
// end of a track list, with a working Download menu that reveals the formats we
// actually offer (MP4 video, MP3/WAV audio).
const downloadOptions = [
  { group: "Video", name: "Raw video", format: "MP4", icon: Video },
  { group: "Video", name: "Aligned video", format: "MP4", icon: Video },
  { group: "Video", name: "Cloud", format: "MP4", icon: Video },
  { group: "Audio", name: "Compressed", format: "MP3", icon: AudioLines },
  { group: "Audio", name: "Raw audio", format: "WAV", icon: AudioLines },
  { group: "Audio", name: "Cloud", format: "MP3", icon: AudioLines },
] as const;

// A macOS-style arrow pointer, drawn inline so the demos stay code-only.
export const CursorArrow = () => (
  <svg width="22" height="22" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M3 2.2 L3 14.3 L6.4 11 L8.6 15.6 L10.8 14.6 L8.6 10 L13.2 10 Z"
      fill="#131313"
      stroke="#ffffff"
      strokeWidth="1.1"
      strokeLinejoin="round"
    />
  </svg>
);

// Where the fingertip should land: the middle of the Download button.
const BTN = { x: 298, y: 92 };

// Auto-playing, code-only demo for the "Tracks, downloads, and backup" feature.
// A cursor glides in and clicks Download, the track list slides aside, and the
// menu of formats we actually offer scales into the middle — then it loops.
export const TrackDownloadDemo = () => {
  const [phase, setPhase] = useState<"idle" | "point" | "click" | "open">(
    "idle",
  );

  useEffect(() => {
    // Duration each phase is held before advancing; then it wraps and repeats.
    const timeline: { phase: typeof phase; ms: number }[] = [
      { phase: "idle", ms: 900 },
      { phase: "point", ms: 450 },
      { phase: "click", ms: 260 },
      { phase: "open", ms: 2400 },
    ];
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      setPhase(timeline[i].phase);
      timer = setTimeout(() => {
        i = (i + 1) % timeline.length;
        run();
      }, timeline[i].ms);
    };
    run();
    return () => clearTimeout(timer);
  }, []);

  const isOpen = phase === "open";
  const isClicking = phase === "click";

  return (
    <div className="relative w-full max-w-[21.5rem]">
      {/* The track list — slides aside and dims when the menu opens. */}
      <motion.div
        animate={
          isOpen
            ? { x: -58, scale: 0.9, opacity: 0.5 }
            : { x: 0, scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="flex items-center gap-2.5 rounded-lg border border-(--landing-faint) bg-background px-2.5 py-2 opacity-45">
          <span className="flex aspect-[4/3] h-9 items-center justify-center rounded-md bg-(--landing-chip)">
            <AudioLines className="size-4 text-foreground/50" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="h-2 w-24 rounded-full bg-muted" />
            <div className="mt-1.5 h-2 w-16 rounded-full bg-(--landing-line)" />
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-border bg-background px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
          <span className="flex aspect-[4/3] h-9 items-center justify-center rounded-md bg-(--landing-chip)">
            <Video className="size-4 text-foreground/60" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-foreground">Alex</p>
            <p className="mt-0.5 text-[0.7rem] text-foreground/45">
              Ready · 2:14 · 2160p
            </p>
          </div>
          <motion.span
            animate={{ scale: isClicking ? 0.9 : 1 }}
            transition={{ duration: 0.12, ease: EASE }}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
          >
            <Download className="size-3.5 text-foreground/60" />
            Download
          </motion.span>
        </div>

        <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-(--landing-faint) bg-background px-2.5 py-2 opacity-45">
          <span className="flex aspect-[4/3] h-9 items-center justify-center rounded-md bg-(--landing-chip)">
            <Monitor className="size-4 text-foreground/50" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="h-2 w-20 rounded-full bg-muted" />
            <div className="mt-1.5 h-2 w-14 rounded-full bg-(--landing-line)" />
          </div>
        </div>
      </motion.div>

      {/* The download menu — scales into the middle when the list moves aside. */}
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        animate={{ opacity: isOpen ? 1 : 0, scale: isOpen ? 1 : 0.92 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="w-44 rounded-xl border border-border bg-background p-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
          {downloadOptions.map((opt, i) => {
            const OptIcon = opt.icon;
            const isFirstOfGroup =
              i === 0 || downloadOptions[i - 1].group !== opt.group;
            return (
              <div key={`${opt.name}-${opt.format}`}>
                {isFirstOfGroup && (
                  <p className="px-2 pt-1 pb-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-foreground/40">
                    {opt.group}
                  </p>
                )}
                <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground">
                  <OptIcon className="size-3.5 text-foreground/55" />
                  {opt.name}
                  <span className="ml-auto rounded-md bg-(--landing-chip) px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-foreground/55">
                    {opt.format}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* The pointer: glides to the button, presses, then fades as the menu opens. */}
      <motion.div
        className="pointer-events-none absolute left-0 top-0 z-10"
        initial={{ x: BTN.x, y: BTN.y + 46, scale: 1, opacity: 0 }}
        animate={{
          x: BTN.x,
          y: isOpen ? BTN.y + 24 : BTN.y,
          scale: isClicking ? 0.82 : 1,
          opacity: isOpen ? 0 : 1,
        }}
        transition={{ duration: isClicking ? 0.12 : 0.5, ease: EASE }}
      >
        <CursorArrow />
      </motion.div>
    </div>
  );
};

// Waypoints the cursor visits across the recorded screen (content-area coords).
const SCREEN_POINTS = [
  { x: 140, y: 46 },
  { x: 314, y: 20 },
];


// Live, code-only demo for the "Screen recorder" feature: a browser window being
// recorded Loom-style — a REC timer, a camera bubble, and a cursor that moves
// around the screen leaving click ripples.
export const ScreenRecorderDemo = () => {
  const [idx, setIdx] = useState(0);
  const [clicking, setClicking] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tv = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000) % 60),
      500,
    );
    return () => clearInterval(tv);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const step = (i: number) => {
      if (cancelled) return;
      setIdx(i);
      setClicking(false);
      timers.push(
        setTimeout(() => {
          setClicking(true);
          timers.push(
            setTimeout(() => step((i + 1) % SCREEN_POINTS.length), 700),
          );
        }, 1150),
      );
    };
    step(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const target = SCREEN_POINTS[idx];
  const ss = String(elapsed).padStart(2, "0");

  return (
    <div className="w-full max-w-[22rem] overflow-hidden rounded-xl border border-border bg-background shadow-[0_10px_34px_rgba(0,0,0,0.14)]">
      {/* Window title bar. */}
      <div className="flex items-center gap-1.5 border-b border-(--landing-line) px-3 py-2">
        <span className="size-2 rounded-full bg-[#ff5f57]" />
        <span className="size-2 rounded-full bg-[#febc2e]" />
        <span className="size-2 rounded-full bg-[#28c840]" />
        <div className="ml-2 h-3 w-32 rounded-full bg-primary" />
      </div>

      {/* Recorded screen content. */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-(--landing-brand-soft) to-(--landing-brand-mid)">
        {/* Faux page being recorded: a header and some text. */}
        <div className="absolute inset-0 flex flex-col gap-2.5 p-3">
          <div className="flex h-4 items-center justify-between">
            <div className="h-2.5 w-24 rounded-full bg-white/85 dark:bg-white/35" />
            <span className="flex h-4 w-12 items-center justify-center rounded bg-[#0041aa] text-[0.45rem] font-semibold text-white">
              Publish
            </span>
          </div>
          <div className="space-y-1.5">
            <div className="h-2 w-40 rounded-full bg-white/60 dark:bg-white/20" />
            <div className="h-2 w-32 rounded-full bg-white/60 dark:bg-white/20" />
          </div>
        </div>

        {/* REC indicator + timer. */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-white/85 px-2 py-1 text-[0.65rem] font-medium text-[#131313] shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-md">
          <motion.span
            className="size-1.5 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
          REC 00:{ss}
          <span className="mx-0.5 h-3 w-px bg-black/10" />
          {/* Pause and stop controls. */}
          <span className="flex items-center gap-[2px]">
            <span className="h-2 w-[2px] rounded-full bg-[#131313]/70" />
            <span className="h-2 w-[2px] rounded-full bg-[#131313]/70" />
          </span>
          <span className="ml-1 size-2 rounded-[2px] bg-red-500" />
        </div>

        {/* Click ripple at the current waypoint. */}
        <motion.span
          className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/15"
          style={{ left: target.x, top: target.y }}
          animate={
            clicking
              ? { scale: [0, 2.4], opacity: [0.5, 0] }
              : { scale: 0, opacity: 0 }
          }
          transition={{ duration: 0.6, ease: "easeOut" }}
        />

        {/* Moving cursor. */}
        <motion.div
          className="pointer-events-none absolute left-0 top-0 z-10"
          animate={{ x: target.x, y: target.y, scale: clicking ? 0.82 : 1 }}
          transition={{ duration: clicking ? 0.12 : 0.8, ease: EASE }}
        >
          <CursorArrow />
        </motion.div>

        {/* Presenter camera, shown as a square video box on the right. */}
        <div className="absolute bottom-2 right-2 flex size-16 items-center justify-center overflow-hidden rounded-lg bg-white/85 shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-md">
          <img
            src="/img/landing/screen-recorder-user.webp"
            alt=""
            loading="lazy"
            className="size-8 select-none rounded-full object-cover"
          />
        </div>
      </div>
    </div>
  );
};

// The comments that pop in one after another in the share demo.
const SHARE_COMMENTS = [
  { name: "Maya", text: "This looks so clean 🔥", color: "#935ac9" },
  { name: "Sam", text: "Love it, shipping today 🚀", color: "#0d9488" },
  { name: "Alex", text: "Great walkthrough 👏", color: "#2563eb" },
];

// Cursor tip target over the Share button, relative to the card.
const COPY = { x: 320, y: 14 };

// Live, code-only demo for the "Share links and comments" feature: a cursor
// shares the link, then people leave comments on the shared recording.
export const CommentsDemo = () => {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(0);
  const [pressing, setPressing] = useState(false);
  const [cursorGone, setCursorGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const push = (fn: () => void, ms: number) =>
      timers.push(setTimeout(fn, ms));
    const run = () => {
      if (cancelled) return;
      setCopied(false);
      setVisible(0);
      setPressing(false);
      setCursorGone(false);
      push(() => setPressing(true), 900);
      push(() => setPressing(false), 1050);
      push(() => {
        setCopied(true);
        setCursorGone(true);
      }, 1080);
      push(() => setVisible(1), 1550);
      push(() => setVisible(2), 2100);
      push(() => setVisible(3), 2650);
      push(run, 5200);
    };
    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="relative w-full max-w-[23rem]">
      {/* Share link row with a Share button. */}
      <div className="relative flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
        <Link2 className="size-4 shrink-0 text-foreground/45" />
        <span className="flex-1 truncate text-xs text-foreground/70">
          openside.to/r/9f2k
        </span>
        <motion.span
          animate={{ scale: pressing ? 0.92 : 1 }}
          transition={{ duration: 0.12, ease: EASE }}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] font-medium ${
            copied
              ? "bg-emerald-500/10 text-emerald-600"
              : "bg-foreground text-background"
          }`}
        >
          {copied ? (
            <>
              <Check className="size-3" />
              Shared
            </>
          ) : (
            <>
              <Share2 className="size-3" />
              Share
            </>
          )}
        </motion.span>

        {/* Cursor pressing the Copy button. */}
        <motion.div
          className="pointer-events-none absolute left-0 top-0 z-10"
          initial={{ x: COPY.x, y: COPY.y + 52, scale: 1, opacity: 0 }}
          animate={{
            x: COPY.x,
            y: cursorGone ? COPY.y + 24 : COPY.y,
            scale: pressing ? 0.82 : 1,
            opacity: cursorGone ? 0 : 1,
          }}
          transition={{ duration: pressing ? 0.12 : 0.5, ease: EASE }}
        >
          <CursorArrow />
        </motion.div>
      </div>

      {/* Comments, floating directly under the link. */}
      <div className="mt-2.5 space-y-1.5">
        {SHARE_COMMENTS.slice(0, visible).map((c) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex items-center gap-2 rounded-xl border border-(--landing-line) bg-background px-2.5 py-2 shadow-[0_2px_10px_rgba(0,0,0,0.04)]"
            >
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold text-white"
                style={{ backgroundColor: c.color }}
              >
                {c.name[0]}
              </span>
              <div className="min-w-0">
                <p className="text-[0.7rem] font-semibold leading-tight text-foreground">
                  {c.name}
                </p>
                <p className="truncate text-[0.7rem] leading-tight text-foreground/60">
                  {c.text}
                </p>
              </div>
            </motion.div>
          ))}
      </div>
    </div>
  );
};

// The live demo shown under each feature card, keyed by the feature's title.
export const featureDemos: Record<string, ComponentType> = {
  "High-quality local recording": LocalRecordingDemo,
  "Tracks, downloads, and backup": TrackDownloadDemo,
  "Screen recorder": ScreenRecorderDemo,
  "Share links and comments": CommentsDemo,
};
