import type { MetadataRoute } from "next";
import ar from "@/messages/ar.json";

// FR-18: installable PWA for coaches (no offline mode in MVP).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ar.common.appName,
    short_name: ar.common.appName,
    // A manifest is static and cannot follow each user's language: it uses the
    // default language (BR-L1). The brand name is the same in both languages.
    description: `${ar.common.tagline} — DFN GYM`,
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: "#C42A1E",
    background_color: "#0B0B0D",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
