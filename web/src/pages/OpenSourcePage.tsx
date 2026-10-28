import { motion } from "framer-motion";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Bug,
  Check,
  GitPullRequest,
  ShieldAlert,
} from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { SiLoom } from "react-icons/si";

import { RiversideIcon } from "@/components/landing/BrandIcons";
import MarketingLayout from "@/components/landing/MarketingLayout";
import { PageHero } from "@/components/landing/sections";
import {
  containerVariants,
  riseVariants,
} from "@/components/landing/motion";

const REPO_URL = "https://github.com/rinkitadhana/openside";

const repoFacts = [
  { label: "License", value: "MIT" },
  { label: "Language", value: "TypeScript" },
  { label: "Apps", value: "web + core" },
];

const terminalLines = [
  { prompt: true, text: `git clone ${REPO_URL}.git` },
  { prompt: true, text: "cd openside/core && pnpm install" },
  { prompt: true, text: "pnpm db:migrate && pnpm dev" },
  { prompt: false, text: "API ready, worker listening for jobs" },
];

const hostingOptions = [
  {
    name: "Bring your own keys",
    tagline: "Use openside.pro on your own infrastructure.",
    need: ["A LiveKit project, on LiveKit Cloud or your own server", "A Cloudflare R2 bucket"],
    get: [
      "Unlimited recording time, participants, and retention",
      "No watermark and no Openside fee",
      "Keys encrypted with AES-256-GCM, never shown back in full",
      "Calls on your LiveKit, recordings in your bucket",
    ],
  },
  {
    name: "Deploy everything",
    tagline: "Run the whole app from the repository.",
    need: [
      "Node.js 20+ and pnpm 10+",
      "PostgreSQL and Redis",
      "LiveKit, Cloudflare R2, and a Clerk app",
    ],
    get: [
      "Every part of Openside on servers you run",
      "The web app on Cloudflare Workers",
      "API and media workers you can scale on their own",
      "Full control to modify anything",
    ],
  },
];

const stack = [
  {
    path: "web/",
    name: "Web app",
    description:
      "React 19 and Vite, served from a Cloudflare Worker. Meeting rooms, the screen recorder, the dashboard, and share pages.",
  },
  {
    path: "core/ · api",
    name: "API",
    description:
      "Express and Socket.IO. Auth, spaces, recording sessions, LiveKit tokens, comments, search, and self-host keys.",
  },
  {
    path: "core/ · finalize",
    name: "Finalize worker",
    description:
      "Stitches uploaded chunks into each recording's master file with ffmpeg, away from the API.",
  },
  {
    path: "core/ · general",
    name: "General worker",
    description:
      "Handles on-demand transcodes, so exports never hold up a finalize.",
  },
];

const services = ["PostgreSQL", "Redis + BullMQ", "LiveKit", "Cloudflare R2"];

const alternativePoints = [
  "Remote podcasts and interviews with a separate local track for every guest",
  "Quick screen recordings with a camera bubble, shared with one link",
  "Comments on shared recordings, and links you can switch off",
  "Downloads as MP4, WebM, MP3, or WAV",
  "Free self-hosting on your own LiveKit and R2",
];

const contributeLinks = [
  {
    icon: Bug,
    title: "Report an issue",
    description: "Found a bug or want a feature? Open an issue on GitHub.",
    href: `${REPO_URL}/issues`,
  },
  {
    icon: GitPullRequest,
    title: "Send a pull request",
    description:
      "Include screenshots and the reasoning behind the change so it's easy to review.",
    href: `${REPO_URL}/pulls`,
  },
  {
    icon: ShieldAlert,
    title: "Report a vulnerability",
    description:
      "Please report security problems privately through a GitHub advisory, not a public issue.",
    href: `${REPO_URL}/security/advisories/new`,
  },
];

const inView = {
  initial: "hidden",
  whileInView: "show",
  viewport: { once: true, margin: "-100px" },
} as const;

const Block = ({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section
    id={id}
    className="border-b border-border px-4 py-16 last:border-b-0 sm:px-6 sm:py-20"
  >
    <div className="mx-auto max-w-5xl">
      <motion.div className="max-w-xl" {...inView} variants={riseVariants}>
        <p className="text-sm font-medium text-foreground/60">{eyebrow}</p>
        <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h2>
        {description && (
          <p className="mt-3 text-base leading-7 text-foreground/70">
            {description}
          </p>
        )}
      </motion.div>
      {children}
    </div>
  </section>
);

const RepoSection = () => (
  <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-20">
    <motion.div
      className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-14"
      {...inView}
      variants={containerVariants}
    >
      <motion.div variants={riseVariants}>
        <p className="text-sm font-medium text-foreground/60">The repository</p>
        <h2 className="font-bricolage mt-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          MIT licensed, every line public.
        </h2>
        <p className="mt-3 text-base leading-7 text-foreground/70">
          Use, modify, and deploy Openside however you like, including for
          commercial work. You can read exactly how recordings and keys are
          handled before you trust it with either.
        </p>
        <dl className="mt-6 flex flex-wrap gap-2">
          {repoFacts.map(({ label, value }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 py-1.5 text-sm"
            >
              <dt className="text-foreground/55">{label}</dt>
              <dd className="font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90"
        >
          <FaGithub className="size-4" />
          View on GitHub
        </a>
      </motion.div>

      <motion.div
        variants={riseVariants}
        className="overflow-hidden rounded-2xl border border-border bg-[#131313] shadow-[0_14px_38px_rgba(0,0,0,0.16)]"
      >
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-xs text-white/40">openside</span>
        </div>
        <pre className="overflow-x-auto p-5 font-mono text-[0.8125rem] leading-7">
          {terminalLines.map(({ prompt, text }) => (
            <div key={text} className={prompt ? "text-white/90" : "text-green-400"}>
              {prompt && <span className="mr-2 select-none text-white/35">$</span>}
              {text}
            </div>
          ))}
        </pre>
      </motion.div>
    </motion.div>
  </section>
);

const HostingSection = () => (
  <Block
    id="self-host"
    eyebrow="Self-hosting"
    title="Two ways to run it yourself."
    description="Keep the hosted app and plug in your own infrastructure, or deploy the entire thing from the repository."
  >
    <motion.div
      className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2"
      {...inView}
      variants={containerVariants}
    >
      {hostingOptions.map(({ name, tagline, need, get }, index) => (
        <motion.div
          key={name}
          variants={riseVariants}
          className="flex flex-col rounded-2xl border border-border bg-foreground/[0.03]"
        >
          <div className="p-6">
            <span className="text-sm font-medium tabular-nums text-foreground/40">
              Option {index + 1}
            </span>
            <h3 className="font-bricolage mt-1 text-xl font-semibold tracking-tight text-foreground">
              {name}
            </h3>
            <p className="mt-1 text-sm text-foreground/60">{tagline}</p>
          </div>
          <div className="border-t border-border p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">
              You need
            </p>
            <ul className="mt-3 space-y-2">
              {need.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-foreground/75"
                >
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-foreground/35" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/45">
              You get
            </p>
            <ul className="mt-3 space-y-2">
              {get.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm text-foreground/75"
                >
                  <Check className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      ))}
    </motion.div>
  </Block>
);

const StackSection = () => (
  <Block
    id="architecture"
    eyebrow="Architecture"
    title="What's inside the repo."
    description="Two apps: a frontend and a backend. The backend builds once and runs as an API plus media workers."
  >
    <motion.ul
      className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-foreground/[0.03]"
      {...inView}
      variants={containerVariants}
    >
      {stack.map(({ path, name, description }) => (
        <motion.li
          key={name}
          variants={riseVariants}
          className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-[11rem_1fr] sm:gap-6 sm:p-6"
        >
          <code className="self-start justify-self-start rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground/70">
            {path}
          </code>
          <div>
            <h3 className="font-bricolage text-base font-semibold tracking-tight text-foreground">
              {name}
            </h3>
            <p className="mt-1 text-sm leading-6 text-foreground/65">
              {description}
            </p>
          </div>
        </motion.li>
      ))}
    </motion.ul>
    <motion.div
      className="mt-4 flex flex-wrap items-center gap-2 text-sm"
      {...inView}
      variants={riseVariants}
    >
      <span className="text-foreground/55">Runs on</span>
      {services.map((service) => (
        <span
          key={service}
          className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground/70"
        >
          {service}
        </span>
      ))}
    </motion.div>
  </Block>
);

const AlternativeSection = () => (
  <section className="border-b border-border px-4 py-16 sm:px-6 sm:py-20">
    <motion.div
      className="mx-auto grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-2 md:gap-16"
      {...inView}
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
      <motion.ul
        variants={riseVariants}
        className="divide-y divide-border self-start overflow-hidden rounded-2xl border border-border bg-foreground/[0.03]"
      >
        {alternativePoints.map((point) => (
          <li
            key={point}
            className="flex items-start gap-3 px-5 py-3.5 text-[0.9375rem] leading-6 text-foreground/75"
          >
            <Check className="mt-1 size-4 shrink-0 text-green-600 dark:text-green-400" />
            {point}
          </li>
        ))}
      </motion.ul>
    </motion.div>
  </section>
);

const ContributeSection = () => (
  <Block
    id="contribute"
    eyebrow="Contribute"
    title="Built in the open."
    description="Issues and pull requests are always welcome."
  >
    <motion.div
      className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3"
      {...inView}
      variants={containerVariants}
    >
      {contributeLinks.map(({ icon: Icon, title, description, href }) => (
        <motion.a
          key={title}
          variants={riseVariants}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex flex-col rounded-2xl border border-border bg-foreground/[0.03] p-6 transition-colors hover:bg-foreground/[0.06]"
        >
          <div className="flex items-center justify-between">
            <span className="flex size-10 items-center justify-center rounded-xl bg-(--landing-chip) text-foreground">
              <Icon className="size-5" />
            </span>
            <ArrowUpRight className="size-4 text-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </div>
          <h3 className="font-bricolage mt-5 text-base font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="mt-1.5 text-sm leading-6 text-foreground/65">
            {description}
          </p>
        </motion.a>
      ))}
    </motion.div>
  </Block>
);

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
    <RepoSection />
    <HostingSection />
    <StackSection />
    <AlternativeSection />
    <ContributeSection />
  </MarketingLayout>
);

export default OpenSourcePage;
