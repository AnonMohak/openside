import { motion } from "framer-motion";
import type { ElementType } from "react";
import {
  AppWindow,
  AudioLines,
  CalendarDays,
  CloudUpload,
  Download,
  FolderOpen,
  Headphones,
  Image,
  Layers,
  Link2,
  MessageCircle,
  MessagesSquare,
  MonitorUp,
  Pause,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UploadCloud,
  UserPlus,
  UserRound,
  Video,
} from "lucide-react";

import MarketingLayout from "@/components/landing/MarketingLayout";
import { PageHero } from "@/components/landing/sections";
import {
  containerVariants,
  riseVariants,
} from "@/components/landing/motion";

type Feature = {
  icon: ElementType;
  title: string;
  description: string;
  tags?: string[];
};

type Chapter = {
  id: string;
  label: string;
  title: string;
  summary: string;
  features: Feature[];
};

const stats = [
  { value: "4K", label: "Max video resolution" },
  { value: "48kHz", label: "Audio sample rate" },
  { value: "4", label: "Export formats" },
  { value: "0", label: "Installs for guests" },
];

const chapters: Chapter[] = [
  {
    id: "quality",
    label: "Recording quality",
    title: "Studio quality on every device.",
    summary:
      "Each participant is recorded in their own browser at full quality, separately from the live call.",
    features: [
      {
        icon: Video,
        title: "Up to 4K video",
        description:
          "Pick resolution and frame rate before recording. Capture is local, so call bandwidth never limits it.",
        tags: ["720p", "1080p", "4K", "24 fps", "30 fps"],
      },
      {
        icon: AudioLines,
        title: "Up to 48kHz audio",
        description:
          "Each mic is recorded on its own device and exports as uncompressed WAV for your editor.",
        tags: ["44.1kHz", "48kHz"],
      },
      {
        icon: SlidersHorizontal,
        title: "Audio cleanup controls",
        description:
          "Toggle noise suppression, echo cancellation, and auto gain, or leave them off for raw signal.",
      },
      {
        icon: Headphones,
        title: "Audio-only mode",
        description:
          "Record podcasts and voiceovers with the camera off, keeping the same local audio quality.",
      },
      {
        icon: UploadCloud,
        title: "Crash-safe, chunked uploads",
        description:
          "Chunks upload while you record with live progress, resume after drops, and stuck takes recover automatically.",
      },
    ],
  },
  {
    id: "call",
    label: "In the call",
    title: "A studio in a browser tab.",
    summary:
      "Guests join from a link, and hosts get everything needed to run the session in one place.",
    features: [
      {
        icon: UserPlus,
        title: "Join with a link",
        description:
          "Guests need no download or account, and can preview their camera and mic before joining.",
      },
      {
        icon: Image,
        title: "Backgrounds and blur",
        description:
          "Blur the room behind you, pick a preset background, or upload an image of your own.",
      },
      {
        icon: MonitorUp,
        title: "Screen sharing",
        description:
          "Share your screen during the call to walk everyone through slides, docs, or a live demo.",
      },
      {
        icon: MessageCircle,
        title: "Chat and reactions",
        description:
          "Send messages and emoji reactions to everyone in the call without leaving the recording screen.",
      },
      {
        icon: ShieldCheck,
        title: "Host controls",
        description:
          "Remove a participant when you need to, or end the session for everyone at once.",
      },
      {
        icon: CalendarDays,
        title: "Scheduled sessions",
        description:
          "Plan a session ahead of time, and every invitee gets an email with a calendar invite.",
      },
    ],
  },
  {
    id: "screen",
    label: "Screen recorder",
    title: "Quick screen recordings, no extension.",
    summary:
      "A standalone recorder for demos, tutorials, and async updates that runs entirely in your browser.",
    features: [
      {
        icon: AppWindow,
        title: "Choose what to record",
        description:
          "Capture your whole screen, a single window, the current tab, or only your camera.",
        tags: ["Full screen", "Window", "Current tab", "Camera only"],
      },
      {
        icon: UserRound,
        title: "Camera bubble",
        description:
          "Show your camera as a circle or square, drag it anywhere, and it's composited in one encode.",
        tags: ["Circle", "Square"],
      },
      {
        icon: Pause,
        title: "Pause, resume, or restart",
        description:
          "Pause mid-take and pick up where you left off, or discard the take and start again.",
      },
      {
        icon: Link2,
        title: "Instant share links",
        description:
          "The take uploads and renders as soon as you stop, then it's one link from your team.",
      },
    ],
  },
  {
    id: "library",
    label: "After the call",
    title: "Every take, organized in one place.",
    summary:
      "Meetings and screen recordings land in one library, with the context your team needs around them.",
    features: [
      {
        icon: FolderOpen,
        title: "Projects for every call",
        description:
          "Each meeting and screen take gets its own project with recordings, tracks, and a description.",
      },
      {
        icon: Search,
        title: "Command menu search",
        description:
          "Jump to any project from the command menu, backed by server-side search across your library.",
      },
      {
        icon: MessagesSquare,
        title: "Threaded comments",
        description:
          "Comment on any recording, reply in threads, and edit what you wrote whenever you need to.",
      },
      {
        icon: CalendarDays,
        title: "Calendar view",
        description:
          "See scheduled sessions next to past recordings and screen takes, all on a single calendar.",
      },
    ],
  },
  {
    id: "sharing",
    label: "Sharing & export",
    title: "Your files in any format.",
    summary:
      "Download everything for your editor, or share a link and let people watch in the browser.",
    features: [
      {
        icon: Layers,
        title: "Mixed and separate tracks",
        description:
          "Get a mixed version for quick review, plus separate audio and video for every participant.",
      },
      {
        icon: Download,
        title: "Export in any format",
        description:
          "Download video and audio in the format your editing workflow expects, from compressed to lossless.",
        tags: ["MP4", "WebM", "MP3", "WAV"],
      },
      {
        icon: Link2,
        title: "Share links you control",
        description:
          "Create a link for any recording, then disable or replace it whenever you want to.",
      },
      {
        icon: CloudUpload,
        title: "Cloud backup",
        description:
          "Keep a server-side mixed copy of the call as a safety net alongside the local tracks.",
      },
    ],
  },
];

const inView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "-100px" },
} as const;

const Stats = () => (
  <motion.dl
    className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4"
    {...inView}
    variants={containerVariants}
  >
    {stats.map(({ value, label }) => (
      <motion.div
        key={label}
        variants={riseVariants}
        className="flex flex-col gap-1 bg-background px-4 py-8 sm:px-8"
      >
        <dt className="order-2 text-sm text-foreground/60">{label}</dt>
        <dd className="font-bricolage order-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {value}
        </dd>
      </motion.div>
    ))}
  </motion.dl>
);

const ChapterSection = ({
  chapter,
  index,
}: {
  chapter: Chapter;
  index: number;
}) => (
  <section
    id={chapter.id}
    className="scroll-mt-16 border-b border-border px-4 py-16 last:border-b-0 sm:px-6 sm:py-20"
  >
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 lg:grid-cols-[17rem_1fr] lg:gap-16">
      <motion.div
        className="lg:sticky lg:top-24 lg:self-start"
        {...inView}
        variants={riseVariants}
      >
        <p className="text-sm font-medium tabular-nums text-foreground/40">
          {String(index + 1).padStart(2, "0")} · {chapter.label}
        </p>
        <h2 className="font-bricolage mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {chapter.title}
        </h2>
        <p className="mt-3 text-base leading-7 text-foreground/65">
          {chapter.summary}
        </p>
      </motion.div>

      <motion.ul
        className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-foreground/[0.03]"
        {...inView}
        variants={containerVariants}
      >
        {chapter.features.map(({ icon: Icon, title, description, tags }) => (
          <motion.li
            key={title}
            variants={riseVariants}
            className="flex gap-4 p-5 sm:p-6"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--landing-chip) text-foreground">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bricolage text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-foreground/65">
                {description}
              </p>
              {tags && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground/70"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  </section>
);

const FeaturesPage = () => (
  <MarketingLayout
    hero={
      <PageHero
        eyebrow="Features"
        title="Everything Openside does, in one place"
        description="Studio-quality local recording, a full call experience, a built-in screen recorder, and a library that keeps every take organized."
      />
    }
  >
    <Stats />
    {chapters.map((chapter, index) => (
      <ChapterSection key={chapter.id} chapter={chapter} index={index} />
    ))}
  </MarketingLayout>
);

export default FeaturesPage;
