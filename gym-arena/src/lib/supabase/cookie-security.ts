/**
 * Whether the Supabase auth cookies get the `Secure` attribute (SECURITY_SPECIFICATION §1).
 *
 * Fail-closed. The answer is Secure unless ALL of these hold:
 * 1. the server is NOT a Vercel deployment (`VERCEL=1` is set by the platform, not by a request);
 * 2. the server's own configuration allows local plain HTTP: `next dev` (NODE_ENV=development)
 *    or the test-only flag AUTH_COOKIES_ALLOW_LOCAL_HTTP=1 (set only by the CI browser job;
 *    the operator preflight refuses it in staging and production files);
 * 3. the request is plain HTTP to this machine (localhost, 127.x, ::1).
 * Request headers can only narrow the exception, never open it: without 1–2 they are not read.
 * The browser client uses the page's real address instead (see client.ts), which a remote site
 * can never make look local.
 */
export interface CookieTrust {
  onVercel: boolean;
  localHttpAllowed: boolean;
}

const LOOPBACK = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/;

/** Trust decided from the server's own environment — never from the request. */
export function serverCookieTrust(env: Record<string, string | undefined>): CookieTrust {
  return {
    onVercel: env.VERCEL === "1",
    localHttpAllowed: env.NODE_ENV === "development" || env.AUTH_COOKIES_ALLOW_LOCAL_HTTP === "1",
  };
}

/** The same, from this process. Static `process.env.NAME` reads so the edge middleware gets them too. */
export function processCookieTrust(): CookieTrust {
  return serverCookieTrust({
    VERCEL: process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_COOKIES_ALLOW_LOCAL_HTTP: process.env.AUTH_COOKIES_ALLOW_LOCAL_HTTP,
  });
}

export function isLocalPlainHttp(protocol: string | null | undefined, host: string | null | undefined): boolean {
  const proto = (protocol ?? "").split(",")[0]!.trim().toLowerCase().replace(/:$/, "");
  const raw = (host ?? "").split(",")[0]!.trim().toLowerCase();
  const hostname = raw.startsWith("[") ? raw.replace(/^(\[[^\]]*\]).*$/, "$1") : raw.replace(/:\d+$/, "");
  return proto === "http" && LOOPBACK.test(hostname);
}

export function authCookieSecure(
  protocol: string | null | undefined,
  host: string | null | undefined,
  trust: CookieTrust = { onVercel: false, localHttpAllowed: false },
): boolean {
  if (trust.onVercel || !trust.localHttpAllowed) return true;
  return !isLocalPlainHttp(protocol, host);
}
