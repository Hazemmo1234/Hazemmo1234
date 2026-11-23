/**
 * Whether the Supabase auth cookies get the `Secure` attribute (SECURITY_SPECIFICATION §1).
 * Fail-closed: always Secure, except a plain-HTTP request to this machine (localhost, 127.x,
 * ::1), which is local development and the CI browser suite. A deployed site is HTTPS on a
 * public host, so its cookies are always Secure; an unknown protocol is treated as Secure too.
 * On a Vercel deployment (`VERCEL=1`, set by the platform for every deployment) the answer is
 * always Secure, without looking at any request header, so no forwarded header can affect it.
 * Pure (no I/O): callers pass the protocol, the host and whether they run on Vercel.
 */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/;

export function authCookieSecure(protocol: string | null | undefined, host: string | null | undefined, onVercel = false): boolean {
  if (onVercel) return true;
  const proto = (protocol ?? "").split(",")[0]!.trim().toLowerCase().replace(/:$/, "");
  const raw = (host ?? "").split(",")[0]!.trim().toLowerCase();
  const hostname = raw.startsWith("[") ? raw.replace(/^(\[[^\]]*\]).*$/, "$1") : raw.replace(/:\d+$/, "");
  return !(proto === "http" && LOOPBACK.test(hostname));
}
