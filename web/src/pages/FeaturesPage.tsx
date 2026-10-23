import {
  AudioLines,
  CalendarDays,
  CloudUpload,
  Headphones,
  Image,
  Layers,
  Link2,
  MessageCircle,
  SlidersHorizontal,
  UploadCloud,
  UserPlus,
  Video,
} from "lucide-react";

import MarketingLayout, {
  SectionDivider,
} from "@/components/landing/MarketingLayout";
import {
  FeaturesSection,
  IconCardGrid,
  PageHero,
  Section,
  SectionHeading,
} from "@/components/landing/sections";

const qualityFeatures = [
  {
    icon: Video,
    title: "Up to 4K video",
    description:
      "Record in 720p, 1080p, or 4K at 24 or 30 frames per second. Video is captured on each device, so the call's connection never limits the quality.",
  },
  {
    icon: AudioLines,
    title: "48kHz audio",
    description:
      "Capture audio at 44.1kHz or 48kHz and export it as uncompressed WAV or as MP3, ready for your editor.",
  },
  {
    icon: SlidersHorizontal,
    title: "Noise suppression and echo cancellation",
    description:
      "Turn on noise suppression, echo cancellation, and auto gain when a room needs it, or leave them off for the cleanest raw audio.",
  },
  {
    icon: Headphones,
    title: "Audio-only mode",
    description:
      "Recording a podcast or a voiceover? Switch to audio-only and skip the camera entirely.",
  },
  {
    icon: Image,
    title: "Background blur and virtual backgrounds",
    description:
      "Blur your background, pick one of the presets, or upload your own image before you start recording.",
  },
  {
    icon: UploadCloud,
    title: "Uploads that survive bad Wi-Fi",
    description:
      "Recordings upload in small chunks while you record. If someone's connection drops, the rest uploads when it comes back.",
  },
];

const collaborationFeatures = [
  {
    icon: UserPlus,
    title: "Guests join with a link",
    description:
      "Send a link and guests join from their browser with just a name. No downloads and no account needed.",
  },
  {
    icon: CalendarDays,
    title: "Scheduling with calendar invites",
    description:
      "Plan a session ahead of time and every invitee gets an email with a calendar invite attached.",
  },
  {
    icon: MessageCircle,
    title: "In-call chat and reactions",
    description:
      "Chat and send emoji reactions during the call without leaving the recording screen.",
  },
  {
    icon: Layers,
    title: "Separate tracks and a mixed recording",
    description:
      "Every participant gets their own audio and video track, plus a mixed version that's ready to review and share.",
  },
  {
    icon: Link2,
    title: "Share links with comments",
    description:
      "Share any recording with a single link, collect comments from viewers, and switch the link off whenever you want.",
  },
  {
    icon: CloudUpload,
    title: "Cloud backup",
    description:
      "Turn on cloud backup to keep a server-side mixed copy of the call as a safety net alongside the local tracks.",
  },
];

const FeaturesPage = () => (
  <MarketingLayout
    hero={
      <PageHero
        eyebrow="Features"
        title="Everything you need to record, right in your browser"
        description="Studio-quality local recording, a separate track for every participant, a built-in screen recorder, and share links with comments."
      />
    }
  >
    <FeaturesSection />
    <SectionDivider />
    <Section id="quality">
      <SectionHeading
        eyebrow="Quality"
        title="Tuned for studio-quality takes."
        description="Openside records on each person's device instead of capturing a compressed stream, so what you get is what their camera and mic actually picked up."
      />
      <IconCardGrid items={qualityFeatures} />
    </Section>
    <SectionDivider />
    <Section id="collaboration">
      <SectionHeading
        eyebrow="Collaboration"
        title="Everything around the recording, too."
        description="Invite guests, schedule sessions, talk during the call, and hand off the finished files without switching tools."
      />
      <IconCardGrid items={collaborationFeatures} />
    </Section>
  </MarketingLayout>
);

export default FeaturesPage;
