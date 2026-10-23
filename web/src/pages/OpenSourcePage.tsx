import { motion } from "framer-motion";
import {
  Check,
  Code2,
  GitPullRequest,
  Infinity as InfinityIcon,
  ScanSearch,
  Server,
  Wallet,
} from "lucide-react";
import { SiLoom } from "react-icons/si";

import { RiversideIcon } from "@/components/landing/BrandIcons";
import MarketingLayout, {
  SectionDivider,
} from "@/components/landing/MarketingLayout";
import {
  IconCardGrid,
  PageHero,
  PrivacySection,
  Section,
  SectionHeading,
} from "@/components/landing/sections";
import {
  containerVariants,
  riseVariants,
} from "@/components/landing/motion";

const openSourceReasons = [
  {
    icon: Code2,
    title: "MIT licensed",
    description:
      "Use, modify, and deploy Openside however you like, including for commercial work.",
  },
  {
    icon: ScanSearch,
    title: "Auditable",
    description:
      "Every line is public on GitHub, so you can check exactly how recordings and keys are handled.",
  },
  {
    icon: Server,
    title: "Runs on your keys",
    description:
      "Connect your own LiveKit and Cloudflare R2. Calls and recordings run on infrastructure you control.",
  },
  {
    icon: InfinityIcon,
    title: "No limits on your own infra",
    description:
      "With your own keys, recording time, participants, and retention are unlimited.",
  },
  {
    icon: Wallet,
    title: "Pay only for infrastructure",
    description:
      "There's no Openside fee for self-hosting. You pay LiveKit and Cloudflare directly for what you use.",
  },
  {
    icon: GitPullRequest,
    title: "Built in the open",
    description:
      "Report issues, suggest features, and send pull requests on GitHub.",
  },
];

const selfHostSteps = [
  {
    title: "Create your LiveKit and R2 credentials",
    description:
      "Set up a LiveKit project, on LiveKit Cloud or your own server, and a Cloudflare R2 bucket for recordings.",
  },
  {
    title: "Add your keys in Openside",
    description:
      "Paste them into your settings. They're encrypted with AES-256-GCM before they're stored and are never shown back in full.",
  },
  {
    title: "Record as usual",
    description:
      "New calls run on your LiveKit and recordings land in your bucket, with no plan limits and no automatic deletion.",
  },
];

const alternativePoints = [
  "Remote podcasts and interviews with a separate local track for every guest",
  "Quick screen recordings with a camera bubble, shared with one link",
  "Comments on shared recordings, and links you can switch off",
  "Downloads as MP4, WebM, MP3, or WAV",
  "Free self-hosting on your own LiveKit and R2",
];

const OpenSourcePage = () => (
  <MarketingLayout
    hero={
      <PageHero
        eyebrow="Open source"
        title="An open-source recording studio you can run yourself"
        description="Openside is MIT licensed and built in the open. Use the hosted version, bring your own keys, or deploy the whole app from GitHub."
      />
    }
  >
    <Section id="why">
      <SectionHeading
        eyebrow="Why open source"
        title="Own your recording stack."
        description="Your recordings are some of the most personal data you have. With Openside you can see how they're handled and choose where they live."
      />
      <IconCardGrid items={openSourceReasons} />
    </Section>
    <SectionDivider />
    <Section id="self-host">
      <SectionHeading
        eyebrow="Self-hosting"
        title="Self-host in three steps."
        description="Use your own keys on openside.pro, or clone the repository and deploy the entire app on your own servers."
      />
      <motion.ol
        className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        variants={containerVariants}
      >
        {selfHostSteps.map(({ title, description }, index) => (
          <motion.li
            key={title}
            variants={riseVariants}
            className="rounded-2xl border border-border bg-background p-6"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#0041aa] text-sm font-semibold text-white">
              {index + 1}
            </span>
            <h3 className="font-bricolage mt-5 text-base font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-6 text-foreground/65">
              {description}
            </p>
          </motion.li>
        ))}
      </motion.ol>
    </Section>
    <SectionDivider />
    <Section id="alternative">
      <motion.div
        className="grid grid-cols-1 gap-10 md:grid-cols-2 md:gap-16"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        variants={containerVariants}
      >
        <motion.div variants={riseVariants}>
          <p className="text-sm font-medium text-foreground/60">Alternative</p>
          <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            An open-source alternative to Riverside and Loom.
          </h2>
          <p className="mt-3 text-base leading-7 text-foreground/70">
            Openside covers what most people reach for{" "}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <RiversideIcon className="size-3.5" />
              Riverside
            </span>{" "}
            for, high-quality remote recording with separate tracks, and what
            they use{" "}
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <SiLoom className="size-3.5" />
              Loom
            </span>{" "}
            for, quick screen recordings shared with a link. It does both in one
            app, and you can read and run all of its code.
          </p>
        </motion.div>
        <motion.ul variants={riseVariants} className="space-y-3 md:pt-8">
          {alternativePoints.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-foreground/75"
            >
              <Check className="mt-1 size-4 shrink-0 text-(--landing-brand-text)" />
              {point}
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </Section>
    <SectionDivider />
    <PrivacySection />
  </MarketingLayout>
);

export default OpenSourcePage;
