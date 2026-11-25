import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers (SECURITY_SPECIFICATION). Supabase is the only external origin the
// browser talks to; evidence and avatars are shown through signed URLs on that origin.
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return "";
  }
})();
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // Next.js inline bootstrap
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseOrigin.replace(/^http/, "ws")}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // The isolated test build (scripts/e2e-isolated.sh) goes to its own folder so it never
  // mixes with the development build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  // Branded 404 for addresses that match no page (src/app/global-not-found.tsx): with two root
  // layouts the framework otherwise falls back to its own unstyled page.
  experimental: { globalNotFound: true },
  // The development-only "N" indicator sat over the phone tab bar's last tab in Arabic and appeared
  // in every development screenshot; production builds never show it.
  devIndicators: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The TV URL carries its key in the query string: never send it as a referrer.
      { source: "/tv", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default withNextIntl(nextConfig);
