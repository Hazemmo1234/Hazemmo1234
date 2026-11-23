/**
 * Whether the Supabase auth cookies get the `Secure` attribute (SECURITY_SPECIFICATION §1).
 * Fail-closed: always Secure, except a plain-HTTP request to this machine (localhost, 127.x,
 * ::1), which is local development and the CI browser suite. A deployed site is HTTPS on a
 * public host, so its cookies are always Secure; an unknown protocol is treated as Secure too.
 * Pure (no I/O): callers pass the protocol and host they see.
 */
const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/;

export function authCookieSecure(protocol: string | null | undefined, host: string | null | undefined): boolean {
  const proto = (protocol ?? "").split(",")[0]!.trim().toLowerCase().replace(/:$/, "");
  const raw = (host ?? "").split(",")[0]!.trim().toLowerCase();
  const hostname = raw.startsWith("[") ? raw.replace(/^(\[[^\]]*\]).*$/, "$1") : raw.replace(/:\d+$/, "");
  return !(proto === "http" && LOOPBACK.test(hostname));
}
