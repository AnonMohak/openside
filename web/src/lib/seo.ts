// Per-page SEO metadata for the public marketing pages. Plain data with no
// React imports: the Cloudflare worker reads it to rewrite the HTML <head> for
// crawlers, and the pages read it to keep the head in sync after navigation.

export const SITE_URL = "https://openside.pro";

export interface SeoMeta {
  title: string;
  description: string;
}

export const SEO_PAGES: Record<string, SeoMeta> = {
  "/": {
    title: "Openside: Open-source alternative to Riverside and Loom",
    description:
      "Record studio-quality podcasts, interviews, and calls right from your browser. Separate tracks for every guest, a built-in screen recorder, and free self-hosting.",
  },
  "/features": {
    title: "Features: Local recording, separate tracks, screen recorder | Openside",
    description:
      "Record up to 4K video and 48kHz audio locally in the browser, get a separate track for every participant, record your screen, and share with a link.",
  },
  "/use-cases": {
    title: "Use cases: Podcasts, interviews, demos, and meetings | Openside",
    description:
      "See how creators and teams use Openside for remote podcasts, video interviews, product demos, client calls, bug reports, team meetings, and testimonials.",
  },
  "/open-source": {
    title: "Open-source recording studio you can self-host | Openside",
    description:
      "Openside is MIT licensed. Self-host it on your own LiveKit and Cloudflare R2, keep recordings on infrastructure you control, and audit every line of code.",
  },
  "/pricing": {
    title: "Pricing: Free demo, Pro at $8.99/mo, or self-host free | Openside",
    description:
      "Try Openside free, upgrade to Pro for managed 4K recording at $8.99 a month, or self-host it for free with unlimited recording on your own keys.",
  },
  "/privacy": {
    title: "Privacy Policy | Openside",
    description: "How Openside collects, uses, and protects your data.",
  },
  "/terms": {
    title: "Terms of Service | Openside",
    description: "The terms for using the hosted Openside service.",
  },
};

/** Normalizes a pathname ("/pricing/" → "/pricing") before looking it up. */
export function getSeoMeta(pathname: string): SeoMeta | undefined {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SEO_PAGES[path];
}
