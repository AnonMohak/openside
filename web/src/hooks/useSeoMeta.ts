import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { SITE_URL, getSeoMeta } from "@/lib/seo";

function setMeta(selector: string, attr: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

/**
 * Keeps the document head in step with the current marketing page after
 * client-side navigation. The worker already serves the right head on a full
 * page load (see worker/index.ts); this mirrors it for in-app route changes.
 */
export function useSeoMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = getSeoMeta(pathname);
    if (!meta) return;

    const url = `${SITE_URL}${pathname === "/" ? "/" : pathname}`;
    document.title = meta.title;
    setMeta('meta[name="description"]', "name", "description", meta.description);
    setMeta('meta[property="og:title"]', "property", "og:title", meta.title);
    setMeta('meta[property="og:description"]', "property", "og:description", meta.description);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", meta.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", meta.description);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;
  }, [pathname]);
}
