/**
 * Whether the Supabase auth cookies get the `Secure` attribute (SECURITY_SPECIFICATION §1).
 *
 * Fail-closed. The answer is Secure unless ALL of these hold:
 * 1. The server is NOT a Vercel deployment. `VERCEL=1` is a platform variable (build and
 *    runtime); nothing in a request can change it. Staging and production run on Vercel, so their
 *    cookies are Secure without reading any request header. (Vercel does not document that it
 *    replaces client-sent Host / X-Forwarded-* values, so no header is treated as trusted there.)
 * 2. The server's OWN configuration allows local plain HTTP:
 *    - `next dev` (NODE_ENV=development). Next.js compiles NODE_ENV="production" into every
 *      production build, so setting NODE_ENV at runtime cannot turn a build into a dev server; or
 *    - the test-only AUTH_COOKIES_ALLOW_LOCAL_HTTP=1, honoured only inside GitHub Actions
 *      (GITHUB_ACTIONS=true): the CI browser job. Anywhere else the flag does nothing, and the
 *      operator preflight refuses it in the staging and production files.
 * 3. The request itself is plain HTTP from and to this machine (`isLocalRequest`).
 *
 * Why step 3 reads request headers, and why that is safe. On a self-hosted Next.js server
 * (`next dev` / `next start`, which here means local development and CI only) `request.nextUrl`
 * in the middleware is the server's OWN address (`http://localhost:<port>`), never the address
 * the client used, so it cannot tell a local request from a remote one. The request's headers
 * are the only description of it, and the client controls them. So they are used ONLY to narrow
 * an exception that steps 1–2 already opened, and only a request that looks plainly local in
 * every header loses Secure: Host is a loopback name, and there is no sign of a proxy or of
 * another client. A client that forges these headers can at most drop Secure from its OWN
 * cookies, and only on a dev or CI server.
 *
 * The browser client uses the page's real address (`window.location`) instead, which a remote
 * site can never make look local.
 */
export interface CookieTrust {
  onVercel: boolean;
  localHttpAllowed: boolean;
}

/** The part of `Headers` this module reads (Fetch `Headers`, `NextRequest.headers`, next/headers). */
export interface HeaderReader {
  get(name: string): string | null;
}

const LOOPBACK_NAME = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1)$/;
const LOOPBACK_IP = /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/;

/** Trust decided from the server's own environment — never from the request. */
export function serverCookieTrust(env: Record<string, string | undefined>): CookieTrust {
  return {
    onVercel: env.VERCEL === "1",
    localHttpAllowed:
      env.NODE_ENV === "development" || (env.AUTH_COOKIES_ALLOW_LOCAL_HTTP === "1" && env.GITHUB_ACTIONS === "true"),
  };
}

/** The same, from this process. Static `process.env.NAME` reads so the edge middleware gets them too. */
export function processCookieTrust(): CookieTrust {
  return serverCookieTrust({
    VERCEL: process.env.VERCEL,
    NODE_ENV: process.env.NODE_ENV,
    AUTH_COOKIES_ALLOW_LOCAL_HTTP: process.env.AUTH_COOKIES_ALLOW_LOCAL_HTTP,
    GITHUB_ACTIONS: process.env.GITHUB_ACTIONS,
  });
}

/** A protocol and host (a page address, or a Host header) that are plain HTTP to this machine. */
export function isLocalPlainHttp(protocol: string | null | undefined, host: string | null | undefined): boolean {
  const proto = (protocol ?? "").split(",")[0]!.trim().toLowerCase().replace(/:$/, "");
  const raw = (host ?? "").split(",")[0]!.trim().toLowerCase();
  const hostname = raw.startsWith("[") ? raw.replace(/^(\[[^\]]*\]).*$/, "$1") : raw.replace(/:\d+$/, "");
  return proto === "http" && LOOPBACK_NAME.test(hostname);
}

const norm = (v: string) => v.trim().toLowerCase();

/**
 * The request describes plain HTTP from this machine to this machine, in every header that could
 * say otherwise. Next.js fills X-Forwarded-Host/-Proto/-For from the real connection only when the
 * client did not send them (a client-sent value passes through), so each must agree:
 *  - Host is a loopback name or address (any port);
 *  - X-Forwarded-Host, if present, is the same as Host;
 *  - X-Forwarded-Proto, if present, is exactly `http`;
 *  - X-Forwarded-For and X-Real-IP, if present, are ONE loopback address (one hop, this machine);
 *  - there is no Forwarded header (RFC 7239: a proxy we do not know about).
 */
export function isLocalRequest(h: HeaderReader): boolean {
  const host = h.get("host");
  if (host === null || host.includes(",") || !isLocalPlainHttp("http", host)) return false;
  if (h.get("forwarded") !== null) return false;
  const xfh = h.get("x-forwarded-host");
  if (xfh !== null && norm(xfh) !== norm(host)) return false;
  const xfp = h.get("x-forwarded-proto");
  if (xfp !== null && norm(xfp) !== "http") return false;
  for (const name of ["x-forwarded-for", "x-real-ip"]) {
    const v = h.get(name);
    if (v !== null && !LOOPBACK_IP.test(norm(v))) return false;
  }
  return true;
}

/** The `secure` cookie option for a request: Secure unless steps 1–3 above all hold. */
export function authCookieSecure(h: HeaderReader, trust: CookieTrust): boolean {
  if (trust.onVercel || !trust.localHttpAllowed) return true;
  return !isLocalRequest(h);
}
