import { motion } from "framer-motion";
import { Check } from "lucide-react";

import MarketingLayout, {
  SectionDivider,
} from "@/components/landing/MarketingLayout";
import {
  PageHero,
  Section,
  SectionHeading,
  UseCasesSection,
} from "@/components/landing/sections";
import { useCases } from "@/components/landing/content";
import {
  containerVariants,
  riseVariants,
} from "@/components/landing/motion";

// The longer write-up for each use case, keyed by its title in `useCases`.
const useCaseDetails: Record<string, { body: string; highlights: string[] }> = {
  Podcasts: {
    body: "Record remote shows with up to 4K video and 48kHz audio per guest. Each person is captured on their own device, so a shaky connection on one end never drags down the rest of the episode.",
    highlights: [
      "A separate track for every host and guest",
      "WAV or MP3 audio, MP4 or WebM video",
      "Audio-only mode for voice-first shows",
    ],
  },
  Interviews: {
    body: "Run one-on-one interviews and panels from the browser. Guests join with a link and a name, and the recording keeps going even if their Wi-Fi blinks mid-answer.",
    highlights: [
      "Guests join without an account",
      "Chunked uploads that recover after drops",
      "A mixed cut for quick review",
    ],
  },
  "Product demos & tutorials": {
    body: "Use the screen recorder for walkthroughs, onboarding videos, and course clips. Show your screen with a camera bubble, then share it with a single link.",
    highlights: [
      "Screen and camera in one recording",
      "Share links with viewer comments",
      "No extension or desktop app to install",
    ],
  },
  "Client & consulting calls": {
    body: "Keep a clean record of client sessions and stakeholder calls. Recordings are private by default, and you decide when a share link exists.",
    highlights: [
      "Private until you share",
      "Switch a share link off at any time",
      "Self-host to keep calls on your own infra",
    ],
  },
  "Bug reports & async updates": {
    body: "Show the bug instead of describing it. A quick screen recording replaces a long ticket or a status meeting, and teammates can reply in the comments.",
    highlights: [
      "Record your screen in a couple of clicks",
      "Comments on every shared recording",
      "Download the file for your issue tracker",
    ],
  },
  "Team meetings": {
    body: "Record standups, planning sessions, and all-hands so people who missed them can catch up. Separate tracks make it easy to review who said what.",
    highlights: [
      "Scheduling with calendar invites",
      "In-call chat and reactions",
      "Separate tracks per participant",
    ],
  },
  "Voiceover & audio-only": {
    body: "Need narration, a voice memo, or an audio course? Record clean, uncompressed audio without turning on a camera.",
    highlights: [
      "Uncompressed WAV export",
      "Optional noise suppression and auto gain",
      "44.1kHz or 48kHz sample rates",
    ],
  },
  "Courses & webinars": {
    body: "Record lessons and cohort calls with the same multi-track setup you use for meetings, and mix in screen recordings for slides and demos.",
    highlights: [
      "Screen recorder for slides and demos",
      "Separate tracks for editing",
      "Share each lesson with its own link",
    ],
  },
};

const UseCasesPage = () => (
  <MarketingLayout
    hero={
      <PageHero
        eyebrow="Use cases"
        title="One recorder for podcasts, interviews, demos, and meetings"
        description="Openside covers remote recording and quick screen recordings in one open-source app. Here's how people use it."
      />
    }
  >
    <UseCasesSection />
    <SectionDivider />
    <Section id="details">
      <SectionHeading
        eyebrow="In detail"
        title="What Openside does for each workflow."
      />
      <motion.div
        className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        variants={containerVariants}
      >
        {useCases.map(({ icon: Icon, title, description }) => {
          const details = useCaseDetails[title];
          return (
            <motion.article
              key={title}
              variants={riseVariants}
              className="flex flex-col rounded-2xl border border-border bg-background p-6"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--landing-brand-tint)/45 text-(--landing-brand-text)">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-bricolage text-lg font-semibold tracking-tight text-foreground">
                  {title}
                </h3>
              </div>
              <p className="mt-4 text-sm leading-6 text-foreground/65">
                {details?.body ?? description}
              </p>
              {details && (
                <ul className="mt-5 space-y-2.5">
                  {details.highlights.map((highlight) => (
                    <li
                      key={highlight}
                      className="flex items-start gap-2.5 text-sm text-foreground/75"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-(--landing-brand-text)" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              )}
            </motion.article>
          );
        })}
      </motion.div>
    </Section>
  </MarketingLayout>
);

export default UseCasesPage;
