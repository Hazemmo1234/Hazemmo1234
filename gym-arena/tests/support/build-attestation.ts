/**
 * Build attestation for the browser suite: proves which Supabase API the Next.js application
 * under test will actually call, and that the RUNNING server is serving exactly that build.
 *
 * Why: the browser talks to whatever Supabase address was compiled into the build
 * (`NEXT_PUBLIC_SUPABASE_URL` is inlined at build time — src/lib/env.ts, src/middleware.ts),
 * not to the address in the test runner's environment. A build left over from another stack
 * (e.g. one baked with the protected stack's 56321) must never be served to a write-capable test.
 *
 * Two steps, both FAIL CLOSED:
 *
 * 1. attestBuild() — the build directory on disk:
 *    - it is exactly the directory `next start` serves: next.config.ts `distDir =
 *      process.env.NEXT_DIST_DIR || ".next"`, joined to the app directory the way Next.js does;
 *      it must stay inside the app directory, and neither it nor anything in it may be a
 *      symlink;
 *    - BUILD_ID and static/<BUILD_ID>/_buildManifest.js exist;
 *    - EVERY file except `cache/` (compiler caches, optimized-image cache — no executable app
 *      code) is read; an unreadable file refuses;
 *    - after undoing the JavaScript escapes of "/", "." and ":" (backslash-, unicode- and
 *      hex-escaped; URL percent-escapes are left for the parser — see normalizeText), every
 *      occurrence of a STATICALLY DISCOVERABLE URL
 *      candidate in the scanned output (source maps included) is parsed with the WHATWG URL
 *      parser and classified by its CANONICAL destination (the parser's hostname and effective
 *      port — not the text before "@", and with alternative IPv4 spellings such as 127.1 or
 *      2130706433 normalised). A discoverable loopback or Supabase-hosted destination must be
 *      the verified API origin (http or ws) or one of the exact KNOWN_LIBRARY_LITERALS; any
 *      other one, any other port (the protected 56321 included), one carrying credentials, or a
 *      backend-like candidate the parser rejects, refuses. Destinations assembled at runtime are
 *      not guaranteed to be found (see "Static-analysis limits");
 *    - the verified origin must be compiled into executable client code (static/**.js) AND
 *      server code (server/**.js) — an address that appears only in a source map or other
 *      non-executable file does not count;
 *    - client code must not read `process.env.NEXT_PUBLIC_SUPABASE_URL` at runtime (= the
 *      value was not inlined).
 *
 * 2. verifyServedBuild() — the running server:
 *    `next start` reads BUILD_ID from its distDir and enumerates <distDir>/static ONCE at
 *    startup; `/_next/static/*` is answered only for files in that list, from that directory
 *    (next@15.5.29 dist/server/lib/router-utils/filesystem.js: buildId read from
 *    `<distDir>/BUILD_ID`, `nextStaticFolderItems` filled from `<distDir>/static`). So if the
 *    running server returns `/_next/static/<attested BUILD_ID>/_buildManifest.js` and every
 *    attested client file containing the verified origin with byte-identical content, it is
 *    serving the attested build's client code, which carries the verified origin. These
 *    requests are unauthenticated GETs of static files; the middleware does not run for
 *    `/_next/static` (src/middleware.ts matcher), so no database is contacted.
 *
 * Limits (stated, not hidden): a byte-for-byte COPY of the attested build served from another
 * directory passes (it is the same build); server-side code is attested on disk only (the
 * server cannot be asked for it), and is tied to the served client by the same distDir.
 *
 * Static-analysis limits: the scanner only sees destinations written as literal URL candidates
 * (an http/https/ws/wss scheme in any letter case, two or more "/" or "\", then an authority of
 * ASCII characters — credentials included — after unescaping), wherever they appear in the text.
 * It cannot guarantee detection of destinations built at runtime, including:
 *   1. template-string URLs assembled from runtime values (e.g. `http://localhost:${somePort}`
 *      — indistinguishable from the allowed Next.js test-proxy literal "http://localhost", see
 *      KNOWN_LIBRARY_LITERALS — or `http://[${address}]`, whose literal part "http://[" names no
 *      host and is therefore not treated as a backend);
 *   2. protocol-relative URLs such as `//host:port`, and scheme forms with fewer than two
 *      slashes (e.g. "http:127.0.0.1");
 *   3. hosts written with non-ASCII characters (e.g. full-width letters the URL parser would map
 *      to ASCII);
 *   4. any other form that is not a detectable literal URL candidate (concatenated pieces,
 *      values computed or decoded at runtime — percent-escapes are left to the URL parser and
 *      only an encoded scheme separator "http%3A%2F%2F" is decoded for discovery);
 *   5. credentials so long that the "@" lies beyond MAX_AUTHORITY (4096) characters, or URLs in
 *      text where a credential region would have to cross whitespace or a double quote.
 * Every scheme occurrence is examined (overlapping occurrences included); a candidate authority
 * longer than MAX_AUTHORITY is refused.
 * Exact literal matching does not make such runtime-built URLs safe, and the allow-list does not
 * authorize any runtime API destination. This module detects ACCIDENTAL misconfiguration (a
 * build compiled for another stack); it is not a complete runtime network-security boundary.
 * The app's own Supabase address has a single source (`NEXT_PUBLIC_SUPABASE_URL`, inlined at
 * build time), which is what this module checks. The separate guards remain: write-target.ts
 * (declared profile, protected names, exact local ports) and stack-identity.ts (the actual
 * containers and database the test process connects to) — they check the TEST process's
 * target, not the destinations the built app may call at runtime.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, sep } from "node:path";

export class BuildAttestationError extends Error {
  constructor(reason: string) {
    super(`Refusing to run browser tests: ${reason}`);
    this.name = "BuildAttestationError";
  }
}

export interface ServedCheck {
  /** URL path the running server must answer, e.g. /_next/static/<id>/_buildManifest.js */
  path: string;
  sha256: string;
}

export interface BuildAttestation {
  distDir: string;
  buildId: string;
  /** the verified Supabase API origin, e.g. http://127.0.0.1:58321 */
  origin: string;
  /** files the running server must serve byte-for-byte */
  served: ServedCheck[];
}

const BUILD_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * Stage A — candidate discovery. An http/https/ws/wss scheme in any letter case, then two or more
 * "/" or "\" (the WHATWG parser accepts both for these schemes), then the authority. There is NO
 * leading word boundary: a scheme embedded after a letter, "_" or an escaped newline
 * ("xhttp://…", "_http://…", "\nhttp://…") is still a candidate — the safer, fail-closed choice.
 *
 * The whole pattern is a zero-width LOOKAHEAD, so `matchAll` tries every position and reports
 * every scheme occurrence — also one that starts inside the previous candidate's authority
 * ("http://a.comhttp://127.0.0.1:56321" yields both). Group 1 is scheme + slashes, group 2 the
 * authority — possibly EMPTY, so that every scheme occurrence reaches the credentials check
 * (e.g. "http://;x@127.0.0.1:56321", whose ordinary authority is empty). The authority
 * (credentials "user:pass@" included, so the parser decides the host)
 * stops at "/", "?", "#", whitespace, quotes, backslash, ( ) { } , ; < > * and "$", so the
 * surrounding JavaScript of an ordinary quoted URL is not absorbed; credentials containing those
 * characters are handled by the separate credentials check (WIDE_AUTHORITY). The authority is
 * capped at MAX_AUTHORITY characters: a longer run is refused (fail closed), which also keeps the
 * scan linear — each position costs a constant-time scheme test, each scheme occurrence at most
 * MAX_AUTHORITY characters.
 */
const MAX_AUTHORITY = 4096;
const URL_RE = /(?=((?:https?|wss?):[\\/]{2,})([A-Za-z0-9._~%!&+=:@[\]-]{0,4096}))/gi;
/**
 * The credentials check (V11-2). URL userinfo may contain characters that end the ordinary
 * authority above (; , ' ( ) * $ { } …), which would cut a candidate before "@" and hide the real
 * host. From each scheme occurrence, this region runs to the first character that ends a WHATWG
 * authority ("/", "\", "?", "#") or cannot be inside a quoted URL (whitespace, double quote,
 * backtick, < >), at most MAX_AUTHORITY characters. If it contains "@", the text after the LAST
 * "@" (where the parser puts the host) is classified on its own; a backend there is refused as
 * "carrying credentials". Sticky (`y`): lastIndex is set explicitly before every use.
 * Because a single quote may be part of userinfo, the region can run past the closing quote of a
 * single-quoted string; a later "@<backend>" in the same unbroken text then causes a conservative
 * refusal (none occurs in the existing builds).
 */
const WIDE_AUTHORITY = /[^\s"`<>\\/?#]{0,4096}/y;
/** host[:port] characters after an "@" (no "@": the host follows the LAST one) */
const HOST_PORT = /^[A-Za-z0-9._~%!&+=:[\]-]*/;
/**
 * Trailing characters that end an expression rather than an authority (":" covers a template such
 * as `http://localhost:${port}`). A trailing "." is deliberately KEPT: trimming it would turn
 * "http://localhost." into the allow-listed "http://localhost". A candidate ending in "." is
 * therefore judged as written (often an unparsable port such as ":56321." — refused if it may name
 * a backend: conservative).
 */
const AUTHORITY_TRAILER = /[!&+=:]+$/;
const SUPABASE_HOSTED = /(^|\.)supabase\.(co|in|net|com)$/i;
/**
 * Exact literals that ship inside the bundled libraries (@supabase/* defaults and JSDoc examples,
 * and the Next.js experimental test-proxy template described below). They are identical in every
 * build of this repository and none is a stack target (no stack uses these hosts or ports).
 * Verified by reading the existing builds .next, .next-test and .next-fresh, whose candidate sets
 * differ ONLY in the stack origin. Matching is exact on the candidate TEXT (scheme + "//" +
 * authority, lowercased, trailing ":" trimmed) and only for a candidate without credentials —
 * so "http://localhost:80", "http://localhost@127.0.0.1:56321" or "http://u@localhost" never
 * match. Any literal not listed here and not equal to the verified origin refuses the run — a
 * library upgrade that adds one fails closed until a person reviews it.
 *
 * "http://localhost" (no port) comes from the Next.js experimental test-proxy code, which builds
 * `http://localhost:${proxyPort}` from a port chosen at runtime (seen in the built middleware,
 * .next/server/src/middleware.js). The scanner sees only the literal part "http://localhost".
 * This entry is narrow at the literal level — "http://localhost:<any digits>" never matches it
 * and is refused unless it is the verified origin — but it is a KNOWN STATIC-ANALYSIS LIMITATION:
 * any other runtime-built `http://localhost:${somePort}` looks identical to this template and is
 * not distinguishable by literal scanning. The entry does NOT authorize localhost, or any
 * runtime-built URL, as the application's API destination (see "Limits" in the module header).
 */
export const KNOWN_LIBRARY_LITERALS: ReadonlySet<string> = new Set([
  "http://localhost", // Next.js experimental test-proxy template `http://localhost:${proxyPort}` (runtime port)
  "http://localhost:9999", // @supabase/auth-js default GoTrue URL (unused: the app always passes its URL)
  "https://supabase.com",
  "https://realtime.supabase.com",
  "https://example.supabase.co", // documentation examples in @supabase/*
  "https://xyzcompany.supabase.co",
  "https://project-id.supabase.co",
  "https://myproject.supabase.co",
]);
const ENV_READ = /process\.env(?:\.NEXT_PUBLIC_SUPABASE_URL\b|\[\s*["'`]NEXT_PUBLIC_SUPABASE_URL["'`]\s*\])/;

/**
 * SOURCE-level normalisation only: undo the JavaScript/JSON escapes a string literal may use for
 * "/", "." and ":" — these ARE the characters at runtime. URL percent-escapes (%2F, %3A, %40, …)
 * are NOT decoded here: inside a URL they are not delimiters (e.g. "localhost%2F@127.0.0.1" is a
 * username, not a path), so decoding them before discovery would create false boundaries
 * (V11-1). They stay intact for the URL parser. The single exception is an encoded scheme
 * separator ("http%3A%2F%2F…", a whole URL percent-encoded e.g. in a query string): only that
 * separator is decoded, so the encoded URL is still discovered — its authority stays encoded and
 * is classified by the parser (with the fail-closed fallback for unparsable hosts).
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\\\//g, "/")
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\u002[eE]/g, ".")
    .replace(/\\u003[aA]/g, ":")
    .replace(/\\x2[fF]/g, "/")
    .replace(/\\x2[eE]/g, ".")
    .replace(/\\x3[aA]/g, ":")
    .replace(/(https?|wss?)%3[aA]%2[fF]%2[fF]/gi, "$1://");
}

/** percent-decode for the fail-closed fallback only (never for discovery or authorization) */
function percentDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) whose embedded IPv4 is in 127.0.0.0/8 — structurally exact:
 *  - dotted form ::ffff:127.x.x.x (text fallback), or
 *  - the parser's hex form ::ffff:7fXX:YYYY — the first group must have exactly four hex digits
 *    starting "7f" (= first octet 127). "::ffff:7f:1" is 0.127.0.1 and does NOT match;
 *    "::ffff:7e00:1" is 126.0.0.1 and does not match; "::ffff:7f00:100" is 127.0.1.0, which IS
 *    loopback and matches.
 * Prefix "::" or the expanded "0:0:0:0:0:" is accepted for both.
 */
const IPV4_MAPPED_LOOPBACK = /^(?:::|(?:0{1,4}:){5})ffff:(?:127\.\d{1,3}\.\d{1,3}\.\d{1,3}|7f[0-9a-f]{2}:[0-9a-f]{1,4})$/;

/**
 * Loopback classification. In the scanner it is applied to the parser's CANONICAL hostname
 * (dotted IPv4 such as 127.0.0.1 — alternative spellings like 127.1, 2130706433, 0x7f000001 or
 * 0177.0.0.1 are already normalised by the WHATWG parser; compressed IPv6 in brackets such as
 * [::1] or [::ffff:7f00:1]), so 127.0.0.0/8 is matched exactly and 126.x / 128.x are not.
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) || h === "0.0.0.0") return true;
  if (h.startsWith("[")) {
    const v6 = h.slice(1, -1);
    return v6 === "::1" || v6 === "::" || /^(0{1,4}:){7}0{0,3}1$/.test(v6) || IPV4_MAPPED_LOOPBACK.test(v6) || /^(0{1,4}:){7}0{1,4}$/.test(v6);
  }
  return false;
}

const DEFAULT_PORT: Readonly<Record<string, string>> = { "http:": "80", "ws:": "80", "https:": "443", "wss:": "443" };
/** after a failed parse: text that could still be an IPv4 address in an alternative spelling */
const NUMERIC_HOST = /^[0-9a-fx.]+$/i;
/** after a failed parse: an IPv6 literal with content (a bare "[" names no host) */
const IPV6_LITERAL = /^\[[0-9a-f:.]/i;

export interface ExpectedTarget {
  origin: string;
  host: string;
  port: string;
}

export type CandidateVerdict =
  | { kind: "not-backend" }
  | { kind: "expected" }
  | { kind: "library-literal" }
  | { kind: "refuse"; reason: string };

/** Host part of an authority as TEXT (after the LAST "@", without the port) — used only when parsing failed. */
function authorityHost(authority: string): string {
  const a = authority.slice(authority.lastIndexOf("@") + 1).toLowerCase();
  if (a.startsWith("[")) {
    const end = a.indexOf("]");
    return end === -1 ? a : a.slice(0, end + 1);
  }
  const colon = a.indexOf(":");
  return colon === -1 ? a : a.slice(0, colon);
}

/**
 * Stages B–F for ONE discovered candidate, kept separate on purpose:
 *  B. parse it with the WHATWG URL parser (Node's global URL);
 *  C. take the CANONICAL destination — the parser's hostname and effective port (default port
 *     when none is written) — never the text before "@";
 *  D. classify: only loopback or Supabase-hosted destinations are backend candidates; a backend
 *     candidate carrying credentials is refused;
 *  E. the verified backend (same canonical host and port) is the only accepted target;
 *  F. otherwise only an exact library literal (KNOWN_LIBRARY_LITERALS, compared on the candidate
 *     text) is tolerated; everything else is refused.
 * A candidate the parser rejects is refused if its text could still name a backend (loopback,
 * Supabase-hosted, numeric IPv4-like, or an IPv6 literal); otherwise it names no backend.
 * @param raw        scheme + slashes + authority, trailing punctuation trimmed
 * @param authority  the authority part of `raw`
 */
export function classifyCandidate(raw: string, authority: string, want: ExpectedTarget): CandidateVerdict {
  // B. parse
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // percent-decoded HERE only, to judge the text conservatively (it can only add refusals)
    const textHost = authorityHost(percentDecode(authority));
    if (isLoopbackHost(textHost) || SUPABASE_HOSTED.test(textHost) || NUMERIC_HOST.test(textHost) || IPV6_LITERAL.test(textHost)) {
      return { kind: "refuse", reason: "an address that cannot be parsed and may name a backend (refused: fail closed)" };
    }
    return { kind: "not-backend" };
  }
  // C. canonical destination
  const host = url.hostname.toLowerCase();
  const port = url.port || DEFAULT_PORT[url.protocol] || "";
  // D. classification
  if (!isLoopbackHost(host) && !SUPABASE_HOSTED.test(host)) return { kind: "not-backend" };
  if (url.username || url.password) return { kind: "refuse", reason: "a backend address carrying credentials" };
  // E. the verified backend
  if (host === want.host && port === want.port) return { kind: "expected" };
  // F. exact library literals (text comparison: no credentials, no extra port, no path)
  if (KNOWN_LIBRARY_LITERALS.has(raw.toLowerCase())) return { kind: "library-literal" };
  return { kind: "refuse", reason: `the build targets a different backend than the verified ${want.origin}` };
}

/**
 * The credentials check (V11-2) for ONE scheme occurrence, starting right after its slashes.
 * Returns the region text up to and including the backend host[:port] that follows the LAST "@"
 * when that destination is a backend (loopback or Supabase-hosted — the verified one included,
 * since credentials are never expected), otherwise null. It can only lead to a refusal; it never
 * authorizes anything and never counts as the verified origin.
 */
function credentialsHideBackend(text: string, scheme: string, start: number, want: ExpectedTarget): string | null {
  WIDE_AUTHORITY.lastIndex = start;
  const region = WIDE_AUTHORITY.exec(text)?.[0] ?? "";
  const at = region.lastIndexOf("@");
  if (at === -1) return null;
  const hostPort = (HOST_PORT.exec(region.slice(at + 1))?.[0] ?? "").replace(AUTHORITY_TRAILER, "");
  if (!hostPort) return null;
  const verdict = classifyCandidate(scheme + hostPort, hostPort, want);
  return verdict.kind === "not-backend" ? null : region.slice(0, at + 1) + hostPort;
}

/** The address this run is allowed to have compiled into the build. */
function expectedOrigin(apiUrl: string): ExpectedTarget {
  let u: URL;
  try {
    u = new URL(apiUrl);
  } catch {
    throw new BuildAttestationError("the verified API URL is not a valid URL");
  }
  if (u.protocol !== "http:" || !u.port) throw new BuildAttestationError(`the verified API URL ${u.origin} is not http with an explicit port`);
  return { origin: `${u.protocol}//${u.hostname}:${u.port}`, host: u.hostname.toLowerCase(), port: u.port };
}

/** Every file under `dir`, refusing symlinks and unreadable entries; `cache/` at the top is skipped. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (e) {
      throw new BuildAttestationError(`cannot read build directory ${relative(root, dir) || "."}: ${(e as Error).message}`);
    }
    for (const name of entries) {
      const full = join(dir, name);
      const rel = relative(root, full);
      if (rel === "cache") continue; // compiler caches + image-optimizer cache: no executable app code
      const st = lstatSync(full);
      if (st.isSymbolicLink()) throw new BuildAttestationError(`the build contains a symlink (${rel})`);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
      else throw new BuildAttestationError(`the build contains an unexpected entry (${rel})`);
    }
  };
  walk(root);
  return out;
}

const sha256 = (buf: Buffer) => createHash("sha256").update(buf).digest("hex");
/** /_next/static URL for a file under <distDir>/static (each segment URI-encoded, as Next.js lists them). */
const staticUrl = (relToStatic: string) => `/_next/static/${relToStatic.split(sep).map(encodeURIComponent).join("/")}`;

/**
 * Attests the build that `next start` would serve for this environment.
 * @param appDir   the Next.js app directory (where next.config.ts lives)
 * @param env      the environment the web server inherits (NEXT_DIST_DIR)
 * @param apiUrl   the VERIFIED Supabase API URL of the target stack
 */
export function attestBuild(appDir: string, env: Readonly<Record<string, string | undefined>>, apiUrl: string): BuildAttestation {
  const want = expectedOrigin(apiUrl);

  // the same resolution as next.config.ts (`distDir: process.env.NEXT_DIST_DIR || ".next"`)
  // and Next.js (path.join(dir, distDir))
  const distName = env.NEXT_DIST_DIR || ".next";
  const appReal = realpathSync(appDir);
  const distDir = join(appReal, distName);
  const relDist = relative(appReal, distDir);
  if (!relDist || relDist.startsWith("..") || relDist.includes(`..${sep}`)) {
    throw new BuildAttestationError(`the build directory (${distName}) is not inside the app directory`);
  }
  let st;
  try {
    st = lstatSync(distDir);
  } catch {
    throw new BuildAttestationError(`no build found in ${relDist} — build the app for this stack first`);
  }
  if (st.isSymbolicLink() || !st.isDirectory()) throw new BuildAttestationError(`${relDist} is not a real directory`);
  if (realpathSync(distDir) !== distDir) throw new BuildAttestationError(`${relDist} resolves through a symlink`);

  let buildId: string;
  try {
    buildId = readFileSync(join(distDir, "BUILD_ID"), "utf8");
  } catch {
    throw new BuildAttestationError(`${relDist}/BUILD_ID is missing or unreadable`);
  }
  if (!BUILD_ID_RE.test(buildId)) throw new BuildAttestationError(`${relDist}/BUILD_ID is malformed`);
  const manifestRel = join(buildId, "_buildManifest.js");

  const files = listFiles(distDir);
  const staticDir = join(distDir, "static");
  const serverDir = join(distDir, "server");
  let inClient = 0;
  let inServer = 0;
  const served: ServedCheck[] = [];
  let manifest: ServedCheck | undefined;

  for (const file of files) {
    const rel = relative(distDir, file);
    let buf: Buffer;
    try {
      buf = readFileSync(file);
    } catch (e) {
      throw new BuildAttestationError(`cannot read ${relDist}/${rel}: ${(e as Error).message}`);
    }
    const text = normalizeText(buf.toString("latin1"));
    let hasOrigin = false;
    for (const m of text.matchAll(URL_RE)) {
      const scheme = m[1]; // scheme + slashes
      const start = m.index + scheme.length;
      // credentials check first: may refuse, never authorizes
      const hidden = credentialsHideBackend(text, scheme, start, want);
      if (hidden) throw new BuildAttestationError(`${relDist}/${rel} contains ${scheme}${hidden} — a backend address carrying credentials`);
      // A. candidate text, without trailing expression punctuation
      if (m[2].length >= MAX_AUTHORITY) {
        throw new BuildAttestationError(`${relDist}/${rel} contains a URL candidate longer than ${MAX_AUTHORITY} characters (refused: fail closed)`);
      }
      const authority = m[2].replace(AUTHORITY_TRAILER, "");
      if (!authority) continue;
      const raw = scheme + authority;
      // B–F
      const verdict = classifyCandidate(raw, authority, want);
      if (verdict.kind === "expected") hasOrigin = true;
      else if (verdict.kind === "refuse") throw new BuildAttestationError(`${relDist}/${rel} contains ${raw} — ${verdict.reason}`);
    }
    const executable = file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".cjs");
    const inStatic = file.startsWith(staticDir + sep);
    if (executable && inStatic && ENV_READ.test(text)) {
      throw new BuildAttestationError(`${relDist}/${rel} reads NEXT_PUBLIC_SUPABASE_URL at runtime (not inlined at build time)`);
    }
    if (inStatic) {
      const relStatic = relative(staticDir, file);
      if (relStatic === manifestRel) manifest = { path: staticUrl(relStatic), sha256: sha256(buf) };
      if (executable && hasOrigin) {
        inClient++;
        served.push({ path: staticUrl(relStatic), sha256: sha256(buf) });
      }
    } else if (executable && hasOrigin && file.startsWith(serverDir + sep)) {
      inServer++;
    }
  }

  if (!manifest) throw new BuildAttestationError(`${relDist}/static/${manifestRel} is missing`);
  if (inClient === 0) throw new BuildAttestationError(`the verified origin ${want.origin} is not compiled into the client code of ${relDist}`);
  if (inServer === 0) throw new BuildAttestationError(`the verified origin ${want.origin} is not compiled into the server code of ${relDist}`);
  return { distDir, buildId, origin: want.origin, served: [manifest, ...served] };
}

export type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal }) => Promise<{ status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Proves the RUNNING server serves the attested build: every attested static file must be
 * answered with 200 and identical bytes. Anything else (other build, missing file, redirect,
 * error, timeout) refuses.
 */
export async function verifyServedBuild(baseURL: string, attestation: BuildAttestation, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<void> {
  let base: URL;
  try {
    base = new URL(baseURL);
  } catch {
    throw new BuildAttestationError("the app base URL is not a valid URL");
  }
  if (base.protocol !== "http:" || !isLoopbackHost(base.hostname)) {
    throw new BuildAttestationError(`the app under test (${base.origin}) is not a local http server`);
  }
  if (attestation.served.length < 2) throw new BuildAttestationError("the attestation has nothing to compare with the running server");
  for (const check of attestation.served) {
    const url = new URL(check.path, base).toString();
    let res;
    try {
      res = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      throw new BuildAttestationError(`the running app did not answer ${check.path}: ${(e as Error).message}`);
    }
    if (res.status !== 200) {
      throw new BuildAttestationError(`the running app answered ${check.path} with ${res.status} — it is not serving build ${attestation.buildId}`);
    }
    const body = Buffer.from(await res.arrayBuffer());
    if (sha256(body) !== check.sha256) {
      throw new BuildAttestationError(`the running app serves a different ${check.path} than build ${attestation.buildId}`);
    }
  }
}
