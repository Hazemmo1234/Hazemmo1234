import "server-only";

import { headers } from "next/headers";

/**
 * The public origin of this deployment, for links shown to the admin (the TV link).
 * APP_ORIGIN (e.g. https://arena.example.com) wins when set; otherwise the request's own
 * host as reported by the platform (x-forwarded-host / host).
 */
export async function requestOrigin(): Promise<string> {
  const configured = process.env.APP_ORIGIN?.replace(/\/+$/, "");
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto.split(",")[0]!.trim()}://${host.split(",")[0]!.trim()}`;
}
