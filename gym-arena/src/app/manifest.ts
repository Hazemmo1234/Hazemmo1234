import type { MetadataRoute } from "next";

// FR-18: installable PWA for coaches (no offline mode in MVP).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DFN Arena",
    short_name: "DFN Arena",
    description: "بطولة الأكثر تطورًا الشهرية — DFN GYM",
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#C42A1E",
    background_color: "#0B0B0D",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
