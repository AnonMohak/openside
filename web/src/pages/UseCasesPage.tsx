import { motion } from "framer-motion";

import MarketingLayout from "@/components/landing/MarketingLayout";
import { PageHero } from "@/components/landing/sections";
import { useCases } from "@/components/landing/content";
import {
  containerVariants,
  riseVariants,
} from "@/components/landing/motion";

// The longer write-up for each use case, keyed by its title in `useCases`.
const useCaseDetails: Record<
  string,
  {
    challenge: string;
    body: string;
    setup: { label: string; value: string }[];
    features: string[];
  }
> = {
  Podcasts: {
    challenge:
      "Remote guests on home Wi-Fi turn a great conversation into a glitchy episode.",
    body: "Openside records every host and guest on their own device, so one shaky connection never drags down the rest of the show. You get a clean track per person, ready to edit.",
    setup: [
      { label: "Mode", value: "Space recording" },
      { label: "Video", value: "1080p or 4K" },
      { label: "Audio", value: "48kHz, export as WAV" },
    ],
    features: [
      "Separate tracks",
      "Audio-only mode",
      "Chunked uploads",
      "WAV and MP3",
    ],
  },
  Interviews: {
    challenge:
      "Guests don't want to install anything, and a dropped connection mid-answer means a lost take.",
    body: "Guests join from a link with just their name. Their side keeps recording locally even if their Wi-Fi blinks, and the rest uploads when it's back.",
    setup: [
      { label: "Mode", value: "Space recording" },
      { label: "Guests", value: "Link only, no account" },
      { label: "Output", value: "Mixed cut + tracks" },
    ],
    features: [
      "Join with a link",
      "Camera and mic preview",
      "Crash-safe uploads",
      "Mixed recording",
    ],
  },
  "Product demos & tutorials": {
    challenge:
      "Walkthroughs need your screen and your face, without a desktop app or a browser extension.",
    body: "Use the screen recorder to capture a window, a tab, or your whole screen with a camera bubble on top, then send it as a link.",
    setup: [
      { label: "Mode", value: "Screen recorder" },
      { label: "Capture", value: "Window or current tab" },
      { label: "Camera", value: "Circle bubble" },
    ],
    features: [
      "Camera bubble",
      "Pause and resume",
      "Share links",
      "Viewer comments",
    ],
  },
  "Client & consulting calls": {
    challenge:
      "Client conversations are sensitive, and you need to control who sees them.",
    body: "Recordings are private by default and only get a link when you create one. Self-host with your own keys to keep every call on your own infrastructure.",
    setup: [
      { label: "Mode", value: "Space recording" },
      { label: "Access", value: "Private until shared" },
      { label: "Storage", value: "Your R2 if self-hosted" },
    ],
    features: [
      "Private by default",
      "Links you can switch off",
      "Self-hosting",
      "Threaded comments",
    ],
  },
  "Bug reports & async updates": {
    challenge:
      "A bug that takes a paragraph to describe takes ten seconds to show.",
    body: "Record the current tab, stop, and paste the link into the ticket. Teammates can reply in the comments, or you can download the file for your issue tracker.",
    setup: [
      { label: "Mode", value: "Screen recorder" },
      { label: "Capture", value: "Current tab" },
      { label: "Share", value: "Link or MP4 download" },
    ],
    features: [
      "Tab capture",
      "Restart a take",
      "Comments",
      "MP4 export",
    ],
  },
  "Team meetings": {
    challenge:
      "People miss meetings, and notes never capture who actually said what.",
    body: "Schedule the session so everyone gets a calendar invite, record it, and keep it in the library with separate tracks for anyone who needs to review.",
    setup: [
      { label: "Mode", value: "Scheduled space" },
      { label: "Invites", value: "Email with calendar file" },
      { label: "Output", value: "Track per person" },
    ],
    features: [
      "Scheduling",
      "Chat and reactions",
      "Screen sharing",
      "Calendar view",
    ],
  },
  "Voiceover & audio-only": {
    challenge:
      "Narration needs clean, uncompressed audio, not a camera feed you'll throw away.",
    body: "Switch to audio-only and record straight from your mic. Leave processing off for the rawest signal, or turn on noise suppression for a noisy room.",
    setup: [
      { label: "Mode", value: "Audio-only" },
      { label: "Audio", value: "48kHz" },
      { label: "Export", value: "WAV" },
    ],
    features: [
      "Audio-only mode",
      "Noise suppression",
      "Auto gain",
      "WAV export",
    ],
  },
  "Courses & webinars": {
    challenge:
      "Lessons mix live discussion with slides and demos, usually across several tools.",
    body: "Record cohort calls with the same multi-track setup you use for meetings, and use the screen recorder for slides and walkthroughs between sessions.",
    setup: [
      { label: "Mode", value: "Space + screen recorder" },
      { label: "Video", value: "1080p" },
      { label: "Share", value: "A link per lesson" },
    ],
    features: [
      "Screen sharing",
      "Separate tracks",
      "Share links",
      "Projects",
    ],
  },
};

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const inView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "-100px" },
} as const;

const UseCaseStory = ({
  useCase,
  index,
}: {
  useCase: (typeof useCases)[number];
  index: number;
}) => {
  const { icon: Icon, title, image } = useCase;
  const details = useCaseDetails[title];
  const flipped = index % 2 === 1;

  return (
    <section
      id={slug(title)}
      className="scroll-mt-6 border-b border-border px-4 py-16 last:border-b-0 sm:px-6 sm:py-20"
    >
      <motion.div
        className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-14"
        {...inView}
        variants={containerVariants}
      >
        <motion.div
          variants={riseVariants}
          className={`relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-primary ${
            flipped ? "md:order-2" : ""
          }`}
        >
          <img
            src={image}
            alt=""
            loading="lazy"
            className="absolute inset-0 size-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <span className="absolute bottom-4 left-4 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium tabular-nums text-white ring-1 ring-white/20 backdrop-blur-md">
            {String(index + 1).padStart(2, "0")} / {String(useCases.length).padStart(2, "0")}
          </span>
        </motion.div>

        <motion.div variants={riseVariants}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--landing-chip) text-foreground">
              <Icon className="size-5" />
            </span>
            <h2 className="font-bricolage text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          </div>

          {details && (
            <>
              <p className="mt-5 border-l-2 border-red-400/60 pl-3 text-sm leading-6 text-foreground/60">
                {details.challenge}
              </p>
              <p className="mt-4 text-base leading-7 text-foreground/80">
                {details.body}
              </p>

              <dl className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border bg-foreground/[0.03]">
                {details.setup.map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
                  >
                    <dt className="text-foreground/55">{label}</dt>
                    <dd className="text-right font-medium text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <ul className="mt-5 flex flex-wrap gap-1.5">
                {details.features.map((feature) => (
                  <li
                    key={feature}
                    className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground/70"
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </>
          )}
        </motion.div>
      </motion.div>
    </section>
  );
};

const UseCasesPage = () => (
  <MarketingLayout
    hero={
      <PageHero
        eyebrow="Use cases"
        title="One recorder for podcasts, interviews, demos, and meetings"
        description="Openside covers remote recording and quick screen recordings in one open-source app. Here's the problem each workflow runs into, and the setup that solves it."
      />
    }
  >
    {useCases.map((useCase, index) => (
      <UseCaseStory key={useCase.title} useCase={useCase} index={index} />
    ))}
  </MarketingLayout>
);

export default UseCasesPage;
