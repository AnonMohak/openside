import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  AudioLines,
  Briefcase,
  Bug,
  Check,
  Code2,
  Download,
  EyeOff,
  GraduationCap,
  Headphones,
  KeyRound,
  Layers,
  Link2,
  Lock,
  Menu,
  MessagesSquare,
  Mic,
  Monitor,
  Moon,
  Podcast,
  Presentation,
  Server,
  Share2,
  ShieldCheck,
  Sun,
  UploadCloud,
  Users,
  Video,
  X,
} from "lucide-react";

import { BsFillRecordCircleFill, BsFillTelephoneFill } from "react-icons/bs";
import { FaGithub } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { SiLoom } from "react-icons/si";
import { FiUploadCloud, FiVideo } from "react-icons/fi";
import { LuScreenShare } from "react-icons/lu";
import { RiMicLine } from "react-icons/ri";

import PageTitle from "@/components/shared/PageTitle";
import SpaceBlueprint from "@/components/landing/SpaceBlueprint";
import GithubStarButton from "@/components/landing/GithubStarButton";
import {
  HeaderAuthCTA,
  PricingCTA,
  StartRecordingCTA,
} from "@/components/landing/LandingAuthCTA";
import AuthModal, { type AuthMode } from "@/components/auth/AuthModal";

// Snappy easeOutExpo curve so things decelerate cleanly instead of drifting.
const EASE = [0.16, 1, 0.3, 1] as const;

// Riverside's logo mark (not in react-icons), taken from their site's navbar SVG.
function RiversideIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 25.14 25.14"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M22.14 0H3C1.34 0 0 1.34 0 3V22.14C0 23.8 1.34 25.14 3 25.14H22.14C23.8 25.14 25.14 23.8 25.14 22.14V3C25.14 1.34 23.8 0 22.14 0ZM19 12.79C18.8 13.37 18.46 14.23 17.96 15.04C17.43 15.91 16.84 16.51 16.22 16.81C15.9 16.97 15.57 17.05 15.24 17.05C15.11 17.05 14.98 17.04 14.86 17.01C14.4 16.92 13.96 16.69 13.56 16.3C12.86 15.62 12.26 14.47 11.71 12.77C11.16 11.06 10.66 10.34 10.34 10.03C10.18 9.88 10.08 9.84 10.03 9.83C10 9.83 9.95 9.83 9.85 9.87C9.57 10 9.22 10.38 8.88 10.92C8.55 11.44 8.23 12.1 7.98 12.8C7.8 13.3 7.25 13.56 6.74 13.38C6.49 13.29 6.29 13.12 6.18 12.88C6.07 12.65 6.06 12.39 6.14 12.15C6.35 11.57 6.71 10.71 7.22 9.9C7.77 9.03 8.37 8.44 9 8.14C9.45 7.93 9.91 7.86 10.37 7.94C10.84 8.02 11.28 8.26 11.68 8.64C12.39 9.32 13 10.48 13.55 12.18C14.1 13.89 14.59 14.62 14.91 14.92C15.07 15.08 15.17 15.11 15.2 15.11C15.22 15.11 15.26 15.12 15.35 15.07C15.62 14.94 15.96 14.56 16.28 14.03C16.6 13.51 16.9 12.84 17.14 12.15C17.31 11.65 17.86 11.38 18.37 11.55C18.62 11.63 18.82 11.81 18.94 12.04C19.05 12.27 19.07 12.53 18.99 12.77L19 12.79Z" />
    </svg>
  );
}

const features = [
  {
    icon: Mic,
    title: "High-quality local recording",
    description:
      "Recording happens locally in your browser, so bad internet never lowers quality. If your connection drops, the file uploads later.",
  },
  {
    icon: Layers,
    title: "Tracks, downloads, and backup",
    description:
      "You get separate audio and video files for each person. Download them as MP4, MP3, or WAV, and turn on cloud backup.",
  },
  {
    icon: Monitor,
    title: "Screen recorder",
    description:
      "A Loom-like way to record quick demos, tutorials, and updates. Capture what you need, then share it with a single link.",
  },
  {
    icon: Share2,
    title: "Share links and comments",
    description:
      "Send each recording with its own link. People can leave comments on it, and you can disable or replace that link any time you want.",
  },
];

const useCases = [
  {
    icon: Podcast,
    title: "Podcasts",
    description:
      "Multi-host remote podcasts with a separate, studio-quality track for every guest.",
    image: "/img/landing/usecase-podcasts.jpg",
  },
  {
    icon: MessagesSquare,
    title: "Interviews",
    description:
      "Video interviews and panel discussions, recorded locally so a bad connection never ruins the take.",
    image: "/img/landing/usecase-interviews.jpg",
  },
  {
    icon: Presentation,
    title: "Product demos & tutorials",
    description:
      "Loom-style screen recordings for walkthroughs, onboarding, and course content.",
    image: "/img/landing/usecase-demos.jpg",
  },
  {
    icon: Briefcase,
    title: "Client & consulting calls",
    description:
      "Record sessions with clients or stakeholders and share a private link when it's ready.",
    image: "/img/landing/usecase-client-calls.jpg",
  },
  {
    icon: Bug,
    title: "Bug reports & async updates",
    description:
      "A quick screen recording that replaces a status meeting or a hard-to-explain bug.",
    image: "/img/landing/usecase-bug-reports.jpg",
  },
  {
    icon: Users,
    title: "Team meetings",
    description:
      "Keep a record of standups and all-hands, with separate tracks if you need to review who said what.",
    image: "/img/landing/usecase-team-meetings.jpg",
  },
  {
    icon: Headphones,
    title: "Voiceover & audio-only",
    description:
      "Just need audio? Record clean, uncompressed WAV or MP3 without touching video.",
    image: "/img/landing/usecase-voiceover.jpg",
  },
  {
    icon: GraduationCap,
    title: "Courses & webinars",
    description:
      "Record lessons and cohort calls with the same screen recorder and multi-track setup you'd use for meetings.",
    image: "/img/landing/usecase-courses.jpg",
  },
];

const faqs = [
  {
    question: "Is Openside free to use?",
    answer:
      "Openside is open source and free to self-host. Bring your own LiveKit and Cloudflare R2 storage and pay only for the infrastructure you use; managed demo and paid plans are also available.",
  },
  {
    question: "How does Openside work?",
    answer:
      "Create a recording space, invite participants with a link, and record from your browsers. When you finish, Openside processes the files into a mixed recording and separate participant tracks that you can download or share.",
  },
  {
    question: "What happens if someone's internet connection is unstable?",
    answer:
      "Openside records each person's audio and video in their browser, rather than relying on a compressed live stream. A brief connection drop will not lower the quality of footage already captured; it uploads when the connection returns.",
  },
  {
    question: "Will I get separate tracks for every participant?",
    answer:
      "Yes. Multi-person recordings include separate audio and video tracks for each participant, alongside a mixed recording for quick review and sharing.",
  },
  {
    question: "Can I download and share my recordings?",
    answer:
      "Yes. Download video as MP4 or WebM and audio as MP3 or WAV. You can also create a share link so viewers can watch the recording in their browser, then disable or replace that link whenever you need to.",
  },
];

const recordingPoints = [
  {
    icon: Lock,
    title: "Recorded on your device",
    description:
      "Your audio and video are captured right in your browser and saved in small chunks as you record.",
  },
  {
    icon: UploadCloud,
    title: "Sent straight to storage",
    description:
      "Each chunk uploads directly to storage over an encrypted connection, instead of streaming through our servers.",
  },
  {
    icon: Share2,
    title: "Private until you share",
    description:
      "Recordings are private by default. You create a share link only when you want to, and can switch it off anytime.",
  },
  {
    icon: ShieldCheck,
    title: "Delete whenever you want",
    description:
      "Remove any recording at any time. It's gone from storage, not just hidden from view.",
  },
];

const selfHostPoints = [
  {
    icon: Server,
    title: "Run it on your own infra",
    description:
      "Connect your own LiveKit and Cloudflare R2, and recordings are stored entirely on infrastructure you control.",
  },
  {
    icon: KeyRound,
    title: "Your keys are encrypted",
    description:
      "The API keys you add are encrypted with AES-256-GCM before they're stored, so they're never saved in plain text.",
  },
  {
    icon: EyeOff,
    title: "Keys are never read back",
    description:
      "Once saved, your keys are masked everywhere. The app only ever shows you a hidden preview, never the full value.",
  },
  {
    icon: Code2,
    title: "Open source and auditable",
    description:
      "Every line of Openside is public, so you can check for yourself exactly how your data and keys are handled.",
  },
];

const pricingPlans = [
  {
    name: "Demo",
    price: "Free",
    priceSuffix: "",
    description:
      "Try Openside instantly, no keys or setup required.",
    features: [
      "720p recording",
      "44.1kHz audio",
      "15 minutes of recording",
      "Up to 2 participants",
      "48-hour retention",
      "Includes watermark",
      "Separate participant tracks",
      "Screen recorder",
      "No setup required",
    ],
    cta: "Try the demo",
    featured: false,
  },
  {
    name: "Pro",
    price: "$8.99",
    priceSuffix: "/mo",
    description:
      "Managed infrastructure with zero setup. Just hit record and we handle the rest.",
    features: [
      "Up to 4K recording",
      "48kHz audio",
      "20 hours of recording per month",
      "Up to 5 participants",
      "30-day recording retention",
      "No watermark",
      "Separate participant tracks",
      "Cloud backup",
      "Screen recorder",
    ],
    cta: "Start with Pro",
    featured: true,
  },
  {
    name: "Self-host",
    price: "Free",
    priceSuffix: "",
    description:
      "Unlimited and free when you run it on your own LiveKit and R2 keys.",
    features: [
      "Up to 4K recording",
      "48kHz audio",
      "Unlimited recording",
      "Unlimited participants",
      "Unlimited retention",
      "No watermark",
      "Separate participant tracks",
      "Cloud backup",
      "Screen recorder",
    ],
    cta: "Get started",
    featured: false,
  },
];

const containerVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.18, delayChildren: 0.1 },
  },
};

const riseVariants = {
  hidden: { opacity: 0, y: 18, filter: "blur(6px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 1, ease: EASE },
  },
};

const boxVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 16 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 1.2, ease: EASE },
  },
};

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
const LocalRecordingDemo = () => {
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
const CursorArrow = () => (
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
const TrackDownloadDemo = () => {
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
  { x: 58, y: 44 },
  { x: 196, y: 84 },
];

// Live, code-only demo for the "Screen recorder" feature: a browser window being
// recorded Loom-style — a REC timer, a camera bubble, and a cursor that moves
// around the screen leaving click ripples.
const ScreenRecorderDemo = () => {
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
        {/* Faux page content. */}
        <div className="absolute left-4 top-4 space-y-2">
          <div className="h-2.5 w-28 rounded-full bg-white/70" />
          <div className="h-2 w-40 rounded-full bg-white/50" />
          <div className="h-2 w-36 rounded-full bg-white/50" />
        </div>

        {/* REC indicator + timer. */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-white/85 px-2 py-1 text-[0.65rem] font-medium text-[#131313] shadow-[0_2px_10px_rgba(0,0,0,0.06)] ring-1 ring-black/5 backdrop-blur-md">
          <motion.span
            className="size-1.5 rounded-full bg-red-500"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
          REC 00:{ss}
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
          <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-[#935ac9] to-[#5b6cff] text-xs font-semibold text-white">
            R
          </span>
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
const CommentsDemo = () => {
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

// Interactive showcase for "Use cases": a pill list of scenarios that drives
// a single detail panel, auto-advancing like a slideshow but overridable by
// clicking any pill (which resets the auto-advance timer).
const UseCasesShowcase = ({ items }: { items: typeof useCases }) => {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActive((a) => (a + 1) % items.length);
    }, 3800);
    return () => clearTimeout(timer);
  }, [active, items.length]);

  const current = items[active];

  return (
    <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-[0.9fr_1.3fr] md:gap-6">
      <div className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
        {items.map(({ icon: ItemIcon, title }, i) => {
          const isActive = i === active;
          return (
            <button
              key={title}
              type="button"
              onClick={() => setActive(i)}
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

      <div className="relative min-h-[30rem] overflow-hidden rounded-2xl border border-border sm:min-h-[34rem] md:min-h-[28rem]">
        <AnimatePresence>
          <motion.div
            key={current.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="absolute inset-0 bg-cover bg-top"
            style={{ backgroundImage: `url(${current.image})` }}
          />
        </AnimatePresence>

        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/5 to-black/50" />

        <AnimatePresence mode="wait">
          <motion.div
            key={current.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative flex h-full flex-col p-8 sm:p-10"
          >
            <h3 className="font-bricolage text-2xl font-semibold tracking-tight text-white">
              {current.title}
            </h3>
            <p className="mt-3 max-w-md text-base leading-7 text-white/80">
              {current.description}
            </p>
          </motion.div>
        </AnimatePresence>

        {/* Progress dashes for the current position in the auto-advance. */}
        <div className="absolute bottom-8 left-8 z-10 flex gap-1.5 sm:left-10">
          {items.map((item, i) => (
            <span
              key={item.title}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === active ? "w-6 bg-white" : "w-1.5 bg-white/35"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Full-width horizontal line between stacked sections, with a small square
// where it meets each side border. Desktop-only chrome.
const SectionDivider = () => (
  <div className="relative hidden border-t border-border md:block">
    <span className="absolute left-[-0.5px] top-[-0.5px] z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-border bg-background" />
    <span className="absolute right-[-0.5px] top-[-0.5px] z-10 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-border bg-background" />
  </div>
);

const themeOptions = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
] as const;

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex w-fit items-center gap-0.5 rounded-lg border border-white/20 bg-white/5 p-0.5"
    >
      {themeOptions.map(({ id, label, icon: Icon }) => {
        const selected = (theme ?? "system") === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(id)}
            className={`flex size-7 cursor-pointer items-center justify-center rounded-md transition-colors ${
              selected
                ? "bg-white/20 text-white"
                : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
};

const LandingPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Stable so the memoized auth CTAs don't re-render on every page render.
  const openAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  // Closing the mobile menu re-renders the header in the same tick as the
  // anchor click, which can race with the browser's native hash-scroll and
  // silently drop it. Scroll explicitly on the next frame instead.
  const handleMobileNavClick = useCallback((id: string) => {
    setMobileMenuOpen(false);
    window.history.pushState(null, "", `#${id}`);
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  // Surface the email-verification confirmation that used to live on /auth.
  useEffect(() => {
    if (searchParams.get("verified") === "email") {
      const next = new URLSearchParams(searchParams);
      next.delete("verified");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div
      className="landing min-h-screen bg-background text-foreground"
    >
      <PageTitle
        title="Home"
        description="Openside. Record, meet, and create together."
      />
      <main className="relative flex min-h-screen flex-col items-center justify-start overflow-hidden bg-background px-4 pt-24 sm:px-6 sm:pt-28">
        <div className="absolute inset-0 z-0 bg-[url('/img/landing/hero-bg.webp')] bg-cover bg-bottom" />

        <header className="absolute inset-x-0 top-0 z-20">
          <nav className="mx-auto grid max-w-5xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center px-4 py-3 sm:px-0">
            <Link to="/" className="flex items-center gap-2 justify-self-start">
              <img
                src="/logo/logo-dark.png"
                className="h-full w-[24px] select-none"
                alt="Openside"
              />
              <span className="text-lg font-bold uppercase text-white">
                Openside
              </span>
            </Link>

            <nav
              aria-label="Landing page navigation"
              className="col-start-2 hidden items-center gap-2 justify-self-center text-sm font-medium text-white/80 md:flex"
            >
              <a
                href="#features"
                className="rounded-lg px-3 py-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                Features
              </a>
              <a
                href="#use-cases"
                className="rounded-lg px-3 py-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                Use cases
              </a>
              <a
                href="#privacy"
                className="rounded-lg px-3 py-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                Privacy
              </a>
              <a
                href="#pricing"
                className="rounded-lg px-3 py-2 transition-colors hover:bg-white/10 hover:text-white"
              >
                Pricing
              </a>
            </nav>

            <div className="col-start-3 flex items-center justify-self-end gap-1.5 sm:gap-2">
              <span className="hidden sm:inline-flex">
                <GithubStarButton />
              </span>
              <span className="hidden md:inline-flex">
                <HeaderAuthCTA onOpenAuth={openAuth} />
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 md:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="size-5" />
                ) : (
                  <Menu className="size-5" />
                )}
              </button>
            </div>
          </nav>

          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="overflow-hidden md:hidden"
              >
                <nav
                  aria-label="Mobile navigation"
                  className="mx-4 mb-3 flex flex-col gap-1 rounded-2xl bg-[#0041aa] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                >
                  <a
                    href="#features"
                    onClick={(event) => {
                      event.preventDefault();
                      handleMobileNavClick("features");
                    }}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Features
                  </a>
                  <a
                    href="#use-cases"
                    onClick={(event) => {
                      event.preventDefault();
                      handleMobileNavClick("use-cases");
                    }}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Use cases
                  </a>
                  <a
                    href="#privacy"
                    onClick={(event) => {
                      event.preventDefault();
                      handleMobileNavClick("privacy");
                    }}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Privacy
                  </a>
                  <a
                    href="#pricing"
                    onClick={(event) => {
                      event.preventDefault();
                      handleMobileNavClick("pricing");
                    }}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Pricing
                  </a>
                  <div className="mt-1 flex items-center gap-2 border-t border-white/15 pt-3">
                    <span className="sm:hidden">
                      <GithubStarButton />
                    </span>
                    <span className="ml-auto">
                      <HeaderAuthCTA onOpenAuth={openAuth} />
                    </span>
                  </div>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="relative z-10 flex w-full max-w-5xl flex-col items-start gap-3 pt-2 pb-20 text-left sm:pt-4"
        >
          <motion.span
            variants={riseVariants}
            className="inline-flex select-none items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 sm:text-sm"
          >
            <FaGithub className="size-3.5" />
            Open-source alternative to
            <span className="inline-flex items-center gap-1 text-white">
              <RiversideIcon className="size-3.5" />
              Riverside
            </span>
            and
            <span className="inline-flex items-center gap-1 text-white">
              <SiLoom className="size-3.5" />
              Loom
            </span>
          </motion.span>

          <motion.h1
            variants={riseVariants}
            className="font-bricolage max-w-4xl text-3xl font-semibold leading-[1.2] text-white sm:text-[2.5rem]"
          >
            Record high quality podcasts, interviews, and calls right from your
            browser
          </motion.h1>

          <motion.p
            variants={riseVariants}
            className="-mt-1 max-w-xl text-sm font-normal text-white/80 sm:text-base"
          >
            Studio-quality recording, open-source at its core. Self-host it free
            or let us handle the infra.
          </motion.p>

          <motion.div
            variants={riseVariants}
            className="mt-3 flex flex-wrap items-center gap-3"
          >
            <StartRecordingCTA
              onOpenAuth={openAuth}
              className="flex select-none items-center gap-2 rounded-lg bg-white px-4.5 py-2.5 text-[0.9375rem] font-semibold text-[#131313] transition-colors hover:bg-white/90 cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
            />
            <a
              href="https://github.com/rinkitadhana/openside"
              target="_blank"
              rel="noopener noreferrer"
              className="flex select-none cursor-pointer items-center gap-2 rounded-lg bg-[#131313] px-4.5 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-[#131313]/90"
            >
              <FaGithub className="size-4" />
              Star on GitHub
            </a>
          </motion.div>

          <div className="relative mt-8 w-full">
            <motion.div
              variants={boxVariants}
              className="relative z-10 aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-background shadow-[0_0_12px_rgba(0,0,0,0.18),0_0_45px_rgba(0,0,0,0.08),0_0_90px_rgba(0,0,0,0.05)] sm:aspect-video"
            >
              <SpaceBlueprint />
            </motion.div>
          </div>
        </motion.section>
      </main>

      <div className="mx-auto max-w-6xl border-x-0 border-border md:border-x">
        <section id="features" className="bg-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="max-w-xl"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={riseVariants}
          >
            <p className="text-sm font-medium text-foreground/60">Features</p>
            <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Record, download, and share in one place.
            </h2>
            <p className="mt-3 text-base leading-7 text-foreground/70">
              From capture to sharing, Openside handles the whole workflow so you
              can focus on the recording itself.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
          >
            {features.map(({ icon: Icon, title, description }) => (
              <motion.article
                key={title}
                variants={riseVariants}
                className="flex flex-col rounded-2xl border border-border bg-background p-6"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-(--landing-chip) text-foreground">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-bricolage mt-5 text-lg font-semibold tracking-tight text-foreground">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-foreground/65">
                  {description}
                </p>
                <div className="relative mt-6 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl bg-[url('/img/landing/feature-bg.jpg')] bg-cover bg-center px-5 sm:aspect-[16/10]">
                  {title === "High-quality local recording" && (
                    <LocalRecordingDemo />
                  )}
                  {title === "Tracks, downloads, and backup" && (
                    <TrackDownloadDemo />
                  )}
                  {title === "Screen recorder" && <ScreenRecorderDemo />}
                  {title === "Share links and comments" && <CommentsDemo />}
                </div>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      <section id="use-cases" className="bg-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="max-w-xl"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={riseVariants}
          >
            <p className="text-sm font-medium text-foreground/60">Use cases</p>
            <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Built for how you actually work.
            </h2>
            <p className="mt-3 text-base leading-7 text-foreground/70">
              From solo creators to compliance-sensitive teams, here is who
              records with Openside.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={riseVariants}
          >
            <UseCasesShowcase items={useCases} />
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      <section id="privacy" className="bg-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="max-w-xl"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={riseVariants}
          >
            <p className="text-sm font-medium text-foreground/60">Privacy</p>
            <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Your recordings stay yours.
            </h2>
            <p className="mt-3 text-base leading-7 text-foreground/70">
              Two things matter here: keeping your recordings safe, and letting
              you run the whole thing yourself. Here is how each works.
            </p>
          </motion.div>

          <motion.div
            className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-2"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
          >
            <motion.div
              variants={riseVariants}
              className="rounded-2xl border border-border bg-background p-6 sm:p-8"
            >
              <h3 className="font-bricolage text-lg font-semibold tracking-tight text-foreground">
                Your recordings
              </h3>
              <p className="mt-1 text-sm leading-6 text-foreground/60">
                From the moment you hit record to the moment you share.
              </p>
              <ul className="mt-6 space-y-6">
                {recordingPoints.map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--landing-brand-tint)/45 text-(--landing-brand-text)">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h4 className="font-bricolage text-base font-medium text-foreground">
                        {title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-foreground/65">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              variants={riseVariants}
              className="rounded-2xl border border-border bg-background p-6 sm:p-8"
            >
              <h3 className="font-bricolage text-lg font-semibold tracking-tight text-foreground">
                Self-hosting and keys
              </h3>
              <p className="mt-1 text-sm leading-6 text-foreground/60">
                Run Openside on your own infrastructure, with your own keys.
              </p>
              <ul className="mt-6 space-y-6">
                {selfHostPoints.map(({ icon: Icon, title, description }) => (
                  <li key={title} className="flex gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--landing-brand-tint)/45 text-(--landing-brand-text)">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h4 className="font-bricolage text-base font-medium text-foreground">
                        {title}
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-foreground/65">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      <section id="pricing" className="bg-background px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="max-w-xl"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={riseVariants}
          >
            <p className="text-sm font-medium text-foreground/60">Pricing</p>
            <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Simple pricing that scales with you.
            </h2>
            <p className="mt-3 text-base leading-7 text-foreground/70">
              Self-host it for free, or let us handle the infrastructure. No
              hidden fees, cancel anytime.
            </p>
          </motion.div>

          <motion.div
            className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3"
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
          >
            {pricingPlans.map((plan) => (
              <motion.div
                key={plan.name}
                variants={riseVariants}
                className={`flex flex-col rounded-2xl border p-6 text-foreground ${
                  plan.featured
                    ? "border-(--landing-brand-tint) bg-(--landing-brand-soft) shadow-[0_12px_34px_rgba(0,65,170,0.14)] ring-1 ring-(--landing-brand-tint)"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bricolage text-lg font-semibold tracking-tight">
                    {plan.name}
                  </h3>
                  {plan.featured && (
                    <span className="rounded-full bg-(--landing-brand-tint) px-2.5 py-1 text-xs font-medium text-(--landing-brand-text)">
                      Popular
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">
                    {plan.price}
                  </span>
                  {plan.priceSuffix && (
                    <span className="text-sm text-foreground/55">
                      {plan.priceSuffix}
                    </span>
                  )}
                </div>

                <p className="mt-3 text-sm leading-6 text-foreground/65">
                  {plan.description}
                </p>

                <ul className="mt-6 mb-8 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm"
                    >
                      <Check
                        className={`mt-0.5 size-4 shrink-0 ${
                          plan.featured ? "text-(--landing-brand-text)" : "text-foreground"
                        }`}
                      />
                      <span className="text-foreground/75">{feature}</span>
                    </li>
                  ))}
                </ul>

                <PricingCTA
                  label={plan.cta}
                  isPro={plan.name === "Pro"}
                  onOpenAuth={openAuth}
                  className={`mt-auto w-full cursor-pointer rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                    plan.featured
                      ? "bg-[#0041aa] text-white hover:bg-[#0041aa]/90"
                      : "bg-foreground text-background hover:bg-foreground/90"
                  }`}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <SectionDivider />

      <section id="faq" className="bg-background px-4 py-20 sm:px-6">
        <motion.div
          className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] md:gap-16"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <motion.div variants={riseVariants}>
            <p className="text-sm font-medium text-foreground/60">
              FAQ
            </p>
            <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Everything you need to know before you record.
            </h2>
          </motion.div>

          <motion.div
            variants={riseVariants}
            className="divide-y divide-border border-y border-border"
          >
            {faqs.map(({ question, answer }, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={question} className="py-5">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                    className="group flex w-full cursor-pointer items-center justify-between gap-4 text-left text-base font-medium text-foreground transition-colors hover:text-(--landing-brand-text)"
                  >
                    {question}
                    <span
                      className={`text-xl font-normal text-foreground/55 transition-[transform,color] duration-300 group-hover:text-(--landing-brand-text) ${
                        isOpen ? "rotate-45" : ""
                      }`}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      isOpen
                        ? "grid-rows-[1fr] opacity-100"
                        : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="max-w-xl pt-3 text-sm leading-6 text-foreground/65">
                        {answer}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      </section>
      </div>

      <footer className="relative overflow-hidden bg-[url('/img/landing/hero-bg.webp')] bg-cover bg-top px-4 py-20 sm:px-6 sm:py-24">
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
        <motion.div
          className="relative mx-auto grid max-w-5xl grid-cols-2 gap-12 sm:grid-cols-[1.4fr_1fr_1fr_1fr]"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={containerVariants}
        >
          <motion.div variants={riseVariants} className="col-span-2 sm:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src="/logo/logo-dark.png"
                className="w-7 select-none"
                alt="Openside"
              />
              <span className="font-bricolage text-xl font-bold uppercase text-white">
                Openside
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-base leading-7 text-white/70">
              Open-source, self-hostable recording studio for podcasts,
              meetings, and interviews.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <a
                href="https://github.com/rinkitadhana/openside"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                className="flex size-10 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/15"
              >
                <FaGithub className="size-4" />
              </a>
              <a
                href="https://x.com/damngruz"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="X (Twitter)"
                className="flex size-10 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white transition-colors hover:bg-white/15"
              >
                <FaXTwitter className="size-4" />
              </a>
            </div>
          </motion.div>

          <motion.div variants={riseVariants}>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/50">
              Product
            </p>
            <div className="mt-4 flex flex-col gap-3 text-base text-white/75">
              <a href="#features" className="w-fit hover:text-white">
                Features
              </a>
              <a href="#use-cases" className="w-fit hover:text-white">
                Use cases
              </a>
              <a href="#privacy" className="w-fit hover:text-white">
                Privacy
              </a>
              <a href="#pricing" className="w-fit hover:text-white">
                Pricing
              </a>
            </div>
          </motion.div>

          <motion.div variants={riseVariants}>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/50">
              Company
            </p>
            <div className="mt-4 flex flex-col gap-3 text-base text-white/75">
              <a
                href="https://x.com/damngruz"
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit hover:text-white"
              >
                Contact us
              </a>
              <a
                href="https://github.com/rinkitadhana/openside"
                target="_blank"
                rel="noopener noreferrer"
                className="w-fit hover:text-white"
              >
                GitHub
              </a>
            </div>
          </motion.div>

          <motion.div variants={riseVariants}>
            <p className="text-sm font-semibold uppercase tracking-wide text-white/50">
              Legal
            </p>
            <div className="mt-4 flex flex-col gap-3 text-base text-white/75">
              <Link to="/privacy" className="w-fit hover:text-white">
                Privacy Policy
              </Link>
              <Link to="/terms" className="w-fit hover:text-white">
                Terms of Service
              </Link>
            </div>
          </motion.div>
        </motion.div>
        <motion.div
          className="relative mx-auto mt-12 flex max-w-5xl flex-col gap-2 border-t border-white/20 pt-6 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-100px" }}
          variants={riseVariants}
        >
          <p>
            © {new Date().getFullYear()} Openside. Open source under the MIT
            License.
          </p>
          <div className="flex items-center gap-4">
            <p className="text-white/50">Built for creators who own their footage.</p>
            <ThemeSwitcher />
          </div>
        </motion.div>
      </footer>

      <AuthModal
        open={authOpen}
        mode={authMode}
        onModeChange={setAuthMode}
        onClose={() => setAuthOpen(false)}
      />
    </div>
  );
};

export default LandingPage;
