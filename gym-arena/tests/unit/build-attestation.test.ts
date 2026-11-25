import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BuildAttestationError,
  KNOWN_LIBRARY_LITERALS,
  attestBuild,
  classifyCandidate,
  isLoopbackHost,
  normalizeText,
  verifyServedBuild,
  type Fetcher,
} from "../support/build-attestation";

// Build attestation (tests/support/build-attestation.ts) against fixture build directories in a
// temporary folder: no Next.js build, no server, no network. Every case that is not exactly the
// verified build must be refused.

const CI_API = "http://127.0.0.1:58321";
const ID = "TestBuildId_123";
const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

/** writes files (path → content) under a new app directory; returns the app directory */
function app(files: Record<string, string>, dist = ".next"): string {
  const root = mkdtempSync(join(tmpdir(), "gym-arena-attest-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, dist, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  return root;
}
const client = (origin = CI_API) => `const s=createClient("${origin}",k);`;
/** a minimal valid build compiled for `origin` */
const build = (origin = CI_API, extra: Record<string, string> = {}) => ({
  BUILD_ID: ID,
  [`static/${ID}/_buildManifest.js`]: "self.__BUILD_MANIFEST={};",
  [`static/${ID}/_ssgManifest.js`]: "self.__SSG_MANIFEST=new Set;",
  "static/chunks/app/login/page-abc.js": client(origin),
  "static/chunks/main-def.js": 'throw Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY")',
  "server/chunks/2905.js": `module.exports="${origin}";`,
  "server/src/middleware.js": `const url="${origin}";`,
  "server/src/middleware.js.map": '{"sourcesContent":["const url = process.env.NEXT_PUBLIC_SUPABASE_URL;"]}',
  ...extra,
});
const without = (files: Record<string, string>, key: string) => Object.fromEntries(Object.entries(files).filter(([k]) => k !== key));
const refused = (fn: () => unknown, reason: RegExp) => {
  expect(fn).toThrow(BuildAttestationError);
  expect(fn).toThrow(reason);
};

describe("build attestation: the build on disk", () => {
  it("a build compiled for the verified CI stack passes; client and server both carry it", () => {
    const a = attestBuild(app(build()), {}, CI_API);
    expect(a.buildId).toBe(ID);
    expect(a.origin).toBe(CI_API);
    expect(a.served.map((s) => s.path)).toEqual([`/_next/static/${ID}/_buildManifest.js`, "/_next/static/chunks/app/login/page-abc.js"]);
  });
  it("a build compiled for the PROTECTED stack (56321) is refused", () => {
    refused(() => attestBuild(app(build("http://127.0.0.1:56321")), {}, CI_API), /127\.0\.0\.1:56321/);
  });
  it("a build compiled for another stack (fresh 57321, development 54321) is refused", () => {
    refused(() => attestBuild(app(build("http://127.0.0.1:57321")), {}, CI_API), /different backend/);
    refused(() => attestBuild(app(build("http://127.0.0.1:54321")), {}, CI_API), /different backend/);
  });
  it("a second backend address anywhere in the build is refused (stale chunk, server file, JSON, HTML)", () => {
    refused(() => attestBuild(app(build(CI_API, { "static/chunks/old-123.js": client("http://127.0.0.1:56321") })), {}, CI_API), /56321/);
    refused(() => attestBuild(app(build(CI_API, { "server/chunks/9.js": 'x="http://127.0.0.1:56321/rest"' })), {}, CI_API), /56321/);
    refused(() => attestBuild(app(build(CI_API, { "server/app/x.rsc": '{"u":"http://127.0.0.1:56322"}' })), {}, CI_API), /56322/);
    refused(() => attestBuild(app(build(CI_API, { "server/app/x.html": "<a href=http://localhost:56321>" })), {}, CI_API), /localhost:56321/);
  });
  it("escaped and encoded forms are normalised and refused", () => {
    expect(normalizeText("http:\\/\\/127.0.0.1:1")).toBe("http://127.0.0.1:1");
    for (const v of ["http:\\/\\/127.0.0.1:56321", "http:\\u002f\\u002f127.0.0.1:56321", "http:\\x2f\\x2f127.0.0.1:56321", "http%3A%2F%2F127.0.0.1:56321", "http://127\\u002e0\\u002e0\\u002e1:56321"]) {
      refused(() => attestBuild(app(build(CI_API, { "static/chunks/esc.js": `"${v}"` })), {}, CI_API), /56321/);
    }
  });
  it("a second backend address with an upper- or mixed-case scheme is detected and refused", () => {
    // the build ALSO contains the verified origin (client + server), so only candidate detection
    // of the uppercase address can refuse it — a lowercase-only scanner would let this build pass
    for (const v of ["HTTP://127.0.0.1:56321", "Http://127.0.0.1:56321", "WS://127.0.0.1:56321", "hTtPs://LOCALHOST:56321"]) {
      refused(() => attestBuild(app(build(CI_API, { "static/chunks/upper.js": `const p=createClient("${v}",k);` })), {}, CI_API), /56321/);
    }
    refused(
      () => attestBuild(app(build(CI_API, { "server/chunks/upper.js": 'module.exports="HTTP://127.0.0.1:56321";' })), {}, CI_API),
      /contains HTTP:\/\/127\.0\.0\.1:56321 — the build targets a different backend/,
    );
  });
  it("loopback aliases and other ports are refused", () => {
    for (const v of ["http://[::1]:58321", "http://localhost:58321", "http://127.0.0.2:58321", "http://0.0.0.0:58321", "http://127.0.0.1:58322", "http://[::ffff:127.0.0.1]:58321", "http://api.localhost:58321"]) {
      refused(() => attestBuild(app(build(CI_API, { "static/chunks/alias.js": `"${v}"` })), {}, CI_API), /different backend/);
    }
  });
  it("hosted Supabase addresses are refused; the exact known library literals are not", () => {
    refused(() => attestBuild(app(build(CI_API, { "server/chunks/c.js": '"https://abcd1234.supabase.co"' })), {}, CI_API), /abcd1234\.supabase\.co/);
    refused(() => attestBuild(app(build(CI_API, { "server/chunks/c.js": '"https://example.supabase.co:443"' })), {}, CI_API), /supabase\.co:443/);
    const literals = [...KNOWN_LIBRARY_LITERALS].map((l) => `"${l}/path"`).join(";");
    expect(() => attestBuild(app(build(CI_API, { "server/chunks/lib.js": literals })), {}, CI_API)).not.toThrow();
  });
  it("the verified origin over ws:// is the same backend and is accepted", () => {
    expect(() => attestBuild(app(build(CI_API, { "server/chunks/rt.js": '"ws://127.0.0.1:58321"' })), {}, CI_API)).not.toThrow();
  });
  it("the origin must be in executable client AND server code — a source map or other file does not count", () => {
    const b = build();
    const noServer = { ...b, "server/chunks/2905.js": "x", "server/src/middleware.js": "x", "server/src/middleware.js.map": `{"x":"${CI_API}"}` };
    refused(() => attestBuild(app(noServer), {}, CI_API), /not compiled into the server code/);
    const noClient = { ...b, "static/chunks/app/login/page-abc.js": "x", "static/chunks/app/login/page-abc.js.map": `{"x":"${CI_API}"}` };
    refused(() => attestBuild(app(noClient), {}, CI_API), /not compiled into the client code/);
  });
  it("client code that reads NEXT_PUBLIC_SUPABASE_URL at runtime (not inlined) is refused", () => {
    refused(() => attestBuild(app(build(CI_API, { "static/chunks/env.js": "const u=process.env.NEXT_PUBLIC_SUPABASE_URL;" })), {}, CI_API), /not inlined/);
    refused(() => attestBuild(app(build(CI_API, { "static/chunks/env.js": 'const u=process.env["NEXT_PUBLIC_SUPABASE_URL"];' })), {}, CI_API), /not inlined/);
  });
  it("the build-time cache is not scanned (it is never served or executed)", () => {
    expect(() => attestBuild(app(build(CI_API, { "cache/webpack/server-production/0.pack": client("http://127.0.0.1:56321") })), {}, CI_API)).not.toThrow();
  });
  it("missing or malformed build identity is refused", () => {
    const b = build();
    refused(() => attestBuild(app({ ...b, BUILD_ID: "../../x" }), {}, CI_API), /BUILD_ID is malformed/);
    refused(() => attestBuild(app({ ...b, BUILD_ID: "" }), {}, CI_API), /BUILD_ID is malformed/);
    refused(() => attestBuild(app(without(b, "BUILD_ID")), {}, CI_API), /BUILD_ID is missing/);
    refused(() => attestBuild(app(without(b, `static/${ID}/_buildManifest.js`)), {}, CI_API), /_buildManifest\.js is missing/);
  });
  it("no build at all is refused", () => {
    const root = mkdtempSync(join(tmpdir(), "gym-arena-attest-"));
    roots.push(root);
    refused(() => attestBuild(root, {}, CI_API), /no build found/);
  });
  it("the directory is the one next start serves: NEXT_DIST_DIR is honoured, and must stay inside the app", () => {
    const root = app(build(), ".next-ci");
    expect(attestBuild(root, { NEXT_DIST_DIR: ".next-ci" }, CI_API).distDir.endsWith(".next-ci")).toBe(true);
    refused(() => attestBuild(root, {}, CI_API), /no build found in \.next/);
    refused(() => attestBuild(root, { NEXT_DIST_DIR: "../elsewhere" }, CI_API), /not inside the app directory/);
  });
  it("symlinks are refused (the build directory itself, or anything inside it)", () => {
    const real = app(build(), "real-build");
    symlinkSync(join(real, "real-build"), join(real, ".next"));
    refused(() => attestBuild(real, {}, CI_API), /not a real directory/);
    const inside = app(build());
    symlinkSync("/etc/hostname", join(inside, ".next", "static", "chunks", "link.js"));
    refused(() => attestBuild(inside, {}, CI_API), /symlink/);
  });
  it("the verified API URL itself must be a local http URL with a port", () => {
    refused(() => attestBuild(app(build()), {}, "not a url"), /not a valid URL/);
    refused(() => attestBuild(app(build()), {}, "https://127.0.0.1:58321"), /not http/);
  });
});

describe("build attestation: candidates are parsed and classified by their canonical destination (F1–F3)", () => {
  // Every negative case adds ONE unexpected candidate to a build that already carries the verified
  // origin in client AND server code, with BUILD_ID and manifest present — so a refusal can only
  // come from that candidate.
  const withClient = (snippet: string) => app(build(CI_API, { "static/chunks/extra.js": snippet }));
  const withServer = (snippet: string) => app(build(CI_API, { "server/chunks/extra.js": snippet }));
  const WANT = { origin: CI_API, host: "127.0.0.1", port: "58321" };
  const verdict = (url: string) => {
    const authority = url.replace(/^[a-z]+:[\\/]+/i, "");
    return classifyCandidate(url, authority, WANT).kind;
  };

  it.each([
    ["F1-01", "http://localhost@127.0.0.1:56321"],
    ["F1-02", "http://u:p@127.0.0.1:56321"],
    ["F1-03", "https://user:pass@127.0.0.1:56321"],
    ["F1-04", "http://user@localhost:56321"],
    ["F1-05", "https://user:pass@project.supabase.co"],
    ["F1-06", "ws://user:pass@127.0.0.1:56321"],
  ])("%s %s — credentials never hide or excuse a backend destination", (_id, url) => {
    refused(() => attestBuild(withClient(`const s=createClient("${url}",k);`), {}, CI_API), /carrying credentials/);
    refused(() => attestBuild(withServer(`module.exports="${url}/rest/v1";`), {}, CI_API), /carrying credentials/);
  });
  it("credentials on the verified host or before the allow-listed literal are refused too; credentials on a non-backend host are not a backend", () => {
    refused(() => attestBuild(withClient('"http://u:p@127.0.0.1:58321"'), {}, CI_API), /carrying credentials/);
    refused(() => attestBuild(withClient('"http://u@localhost"'), {}, CI_API), /carrying credentials/);
    expect(verdict("http://localhost@evil.example")).toBe("not-backend");
    expect(verdict("https://a@b")).toBe("not-backend"); // URL-support feature test shipped in bundles
  });

  it.each([
    ["F2-01 escaped newline", 'const m="line\\nhttp://127.0.0.1:56321";'],
    ["F2-01 real newline", 'const m="line\nhttp://127.0.0.1:56321";'],
    ["F2-02 letter prefix", 'const m="xhttp://127.0.0.1:56321";'],
    ["F2-03 underscore prefix", "const m=_http://127.0.0.1:56321;"],
    ["F2 backslashes", 'const m="http:\\\\\\\\127.0.0.1:56321";'],
  ])("%s — a scheme is found wherever it appears", (_id, snippet) => {
    refused(() => attestBuild(withClient(snippet), {}, CI_API), /127\.0\.0\.1:56321 — the build targets a different backend/);
  });

  it.each([
    ["F3-01", "http://127.1:56321"],
    ["F3-02", "http://2130706433:56321"],
    ["F3-03", "http://0x7f000001:56321"],
    ["F3-04", "http://0177.0.0.1:56321"],
    ["F3-05", "http://127.0.1:56321"],
    ["F3-06", "http://127.255.255.255:56321"],
    ["F3 percent-encoded host", "http://%31%32%37.0.0.1:56321"],
  ])("%s %s — alternative IPv4 spellings of 127.0.0.0/8 are loopback", (_id, url) => {
    expect(isLoopbackHost(new URL(url).hostname)).toBe(true);
    expect(verdict(url)).toBe("refuse");
    refused(() => attestBuild(withServer(`x="${url}"`), {}, CI_API), /different backend/);
  });
  it.each([
    ["F3-07", "http://126.0.0.1:56321"],
    ["F3-08", "http://128.0.0.1:56321"],
  ])("%s %s — numerically adjacent addresses are not loopback (existing policy: not a backend)", (_id, url) => {
    expect(isLoopbackHost(new URL(url).hostname)).toBe(false);
    expect(verdict(url)).toBe("not-backend");
    expect(() => attestBuild(withClient(`"${url}"`), {}, CI_API)).not.toThrow();
  });

  it("SAFE-01 the verified backend in normal form passes (also with a path)", () => {
    expect(verdict("http://127.0.0.1:58321")).toBe("expected");
    expect(verdict("ws://127.0.0.1:58321")).toBe("expected");
    expect(() => attestBuild(withClient('"http://127.0.0.1:58321/rest/v1"'), {}, CI_API)).not.toThrow();
  });
  it("SAFE-02 the exact library literals behave as before; nothing near them is allowed", () => {
    for (const l of KNOWN_LIBRARY_LITERALS) expect(verdict(l), l).toBe("library-literal");
    // the Next.js test-proxy template as it appears in the built middleware
    expect(() => attestBuild(withServer("const r=await originalFetch(`http://localhost:${proxyPort}`,{"), {}, CI_API)).not.toThrow();
    // Zod's runtime IPv6 template: the literal part "http://[" names no host
    expect(() => attestBuild(withServer("return!!a.test(b)&&as(`http://[${b}]`)"), {}, CI_API)).not.toThrow();
    for (const near of ["http://localhost:80", "http://localhost:56321", "https://xyzcompany.supabase.co:8443", "http://localhost.", "https://u@supabase.com"]) {
      expect(verdict(near), near).toBe("refuse");
    }
  });
  it.each([
    ["SAFE-03", "http://[::1]:56321"],
    ["SAFE-04 expanded", "http://[0:0:0:0:0:0:0:1]:56321"],
    ["SAFE-04 IPv4-mapped", "http://[::ffff:127.0.0.1]:56321"],
    ["SAFE-04 unspecified", "http://[::]:56321"],
  ])("%s %s — IPv6 loopback is refused", (_id, url) => {
    expect(verdict(url)).toBe("refuse");
    refused(() => attestBuild(withClient(`"${url}"`), {}, CI_API), /different backend/);
  });
  it("SAFE-04 an ordinary IPv6 address is not classified as loopback", () => {
    expect(isLoopbackHost(new URL("http://[2001:db8::1]:56321").hostname)).toBe(false);
    expect(verdict("http://[2001:db8::1]:56321")).toBe("not-backend");
  });
  it("SAFE-05 ordinary non-backend addresses keep the existing policy (not a backend)", () => {
    for (const url of ["http://203.0.113.5:56321", "https://example.com", "https://supabase.github.io"]) expect(verdict(url), url).toBe("not-backend");
    expect(() => attestBuild(withClient('"http://203.0.113.5:56321" "https://example.com/x"'), {}, CI_API)).not.toThrow();
  });
  it("a backend-like candidate the URL parser rejects is refused (fail closed); one naming no host is not a backend", () => {
    refused(() => attestBuild(withClient('"http://127.0.0.1:99999"'), {}, CI_API), /cannot be parsed/);
    refused(() => attestBuild(withClient('"http://999.0.0.1:56321"'), {}, CI_API), /cannot be parsed/);
    refused(() => attestBuild(withClient('"http://[::1:56321"'), {}, CI_API), /cannot be parsed/);
    expect(verdict("http://[")).toBe("not-backend");
  });
  it("delimiters end a candidate; a trailing '.' is kept and judged conservatively", () => {
    refused(() => attestBuild(withClient("(http://127.0.0.1:56321)"), {}, CI_API), /contains http:\/\/127\.0\.0\.1:56321 —/);
    refused(() => attestBuild(withClient("see http://127.0.0.1:56321."), {}, CI_API), /127\.0\.0\.1:56321\./);
    // conservative: even the verified origin followed by "." is an unparsable port → refused
    refused(() => attestBuild(withClient("see http://127.0.0.1:58321."), {}, CI_API), /cannot be parsed/);
    expect(() => attestBuild(withClient('f("http://localhost:9999",x)'), {}, CI_API)).not.toThrow();
  });
});

describe("build attestation: V11 hardening (percent-escapes, credential delimiters, overlapping schemes, mapped IPv6)", () => {
  // Integration cases go through attestBuild with the verified origin present in client AND server
  // code (plus BUILD_ID and manifest), so only the added text can cause the refusal.
  const withClient = (snippet: string) => app(build(CI_API, { "static/chunks/extra.js": snippet }));
  const withServer = (snippet: string) => app(build(CI_API, { "server/chunks/extra.js": snippet }));
  const WANT = { origin: CI_API, host: "127.0.0.1", port: "58321" };
  const verdict = (url: string) => classifyCandidate(url, url.replace(/^[a-z]+:[\\/]+/i, ""), WANT).kind;

  // V11-1 — integration (attestBuild): percent-escapes stay intact until the URL parser
  it.each([
    ["%2F in userinfo", "http://localhost%2F@127.0.0.1:56321"],
    ["%2F in a username", "http://user%2Fname@127.0.0.1:56321"],
    ["%3A in credentials", "http://user%3Apass@127.0.0.1:56321"],
    ["%40 in credentials", "http://user%40name@127.0.0.1:56321"],
    ["several escapes", "http://a%2Fb%3Ac%40d%25e@127.0.0.1:56321"],
  ])("V11-1 %s (%s) is refused in client and server code", (_name, url) => {
    refused(() => attestBuild(withClient(`const s=createClient("${url}",k);`), {}, CI_API), /carrying credentials/);
    refused(() => attestBuild(withServer(`module.exports="${url}";`), {}, CI_API), /carrying credentials/);
  });
  it("V11-1 normalizeText leaves URL percent-escapes alone; only an encoded scheme separator is decoded", () => {
    expect(normalizeText("http://localhost%2F@127.0.0.1:56321")).toBe("http://localhost%2F@127.0.0.1:56321");
    expect(normalizeText("a%3Ab%2Fc")).toBe("a%3Ab%2Fc");
    expect(normalizeText("x=http%3A%2F%2F127.0.0.1")).toBe("x=http://127.0.0.1");
  });
  it("V11-1 percent-containing non-backend text keeps the existing policy (not a backend)", () => {
    expect(() => attestBuild(withClient('"https://example.com/a%2Fb" "https://cdn.example.com%2Fx" "100%3A1"'), {}, CI_API)).not.toThrow();
  });
  it("V11-1 an encoded whole URL is still discovered, and its encoded authority judged conservatively", () => {
    refused(() => attestBuild(withClient('"redirect=http%3A%2F%2F127.0.0.1:56321"'), {}, CI_API), /different backend/);
    refused(() => attestBuild(withClient('"redirect=http%3A%2F%2F127.0.0.1%3A56321"'), {}, CI_API), /cannot be parsed/);
  });

  // V11-2 — integration (attestBuild): characters in credentials that end the ordinary authority
  it.each([";", ",", "'", "(", ")", "*", "$"])("V11-2 credentials containing %s cannot hide 127.0.0.1:56321 (client and server)", (ch) => {
    const url = `http://u${ch}x@127.0.0.1:56321`;
    refused(() => attestBuild(withClient(`const s=createClient("${url}",k);`), {}, CI_API), /carrying credentials/);
    refused(() => attestBuild(withServer(`module.exports="${url}/rest";`), {}, CI_API), /carrying credentials/);
  });
  it.each([
    ["multiple @", "http://a@b@127.0.0.1:56321"],
    ["delimiter and multiple @", "http://a;b@c(d@127.0.0.1:56321"],
    ["empty username", "http://:pass@127.0.0.1:56321"],
    ["empty password", "http://user:@127.0.0.1:56321"],
    ["empty userinfo", "http://@127.0.0.1:56321"],
    ["Supabase-hosted", "https://u;x@project.supabase.co"],
    ["the verified backend", "http://u;x@127.0.0.1:58321"],
    ["template placeholder in credentials", "http://u${x}@127.0.0.1:56321"],
    ["credentials starting with a delimiter", "http://;x@127.0.0.1:56321"],
    ["credentials starting with a quote", "http://'x@127.0.0.1:56321"],
  ])("V11-2 %s (%s) is refused", (_name, url) => {
    refused(() => attestBuild(withClient(`"${url}"`), {}, CI_API), /carrying credentials/);
  });
  it("V11-2 credentials on a non-backend host, the URL feature test and the library templates stay safe", () => {
    expect(() =>
      attestBuild(
        withServer(
          [
            'new URL("https://a@b").username',
            '"http://u;x@evil.example"',
            '"http://127.0.0.1:56321@evil.example"',
            "originalFetch(`http://localhost:${proxyPort}`,{method:\"POST\"})",
            "as(`http://[${b}]`)",
            "'https://cdn.example.com',a={b:1}",
          ].join(";"),
        ),
        {},
        CI_API,
      ),
    ).not.toThrow();
  });

  // V11-3 — integration (attestBuild): every scheme occurrence is examined
  it.each([
    "http://a.comhttp://127.0.0.1:56321",
    "http://http://127.0.0.1:56321",
    "https://example.comhttps://127.0.0.1:56321",
    "http://a.comws://127.0.0.1:56321",
    "https://example.comwss://127.0.0.1:56321",
    "http://a.comhttp://b.comhttps://127.0.0.1:56321",
  ])("V11-3 %s — the embedded scheme is found (client and server)", (text) => {
    refused(() => attestBuild(withClient(`"${text}"`), {}, CI_API), /127\.0\.0\.1:56321 — the build targets a different backend/);
    refused(() => attestBuild(withServer(`x="${text}"`), {}, CI_API), /127\.0\.0\.1:56321 — the build targets a different backend/);
  });
  it("V11-3 an over-long candidate authority is refused (fail closed, bounded work)", () => {
    refused(() => attestBuild(withClient(`"http://${"a".repeat(5000)}"`), {}, CI_API), /longer than 4096 characters/);
  });

  // V11-4 — helper (isLoopbackHost) + classifier (classifyCandidate) + one integration case
  it.each<[string, boolean]>([
    ["[::ffff:127.0.0.1]", true],
    ["[::ffff:7f00:1]", true],
    ["[::ffff:7f00:100]", true], // = 127.0.1.0, inside 127.0.0.0/8 — loopback
    ["[0:0:0:0:0:ffff:7f00:1]", true],
    ["[::ffff:7f:1]", false], // = 0.127.0.1
    ["[::ffff:7e00:1]", false], // = 126.0.0.1
    ["[::ffff:c000:201]", false], // = 192.0.2.1
    ["[::1]", true],
    ["[0:0:0:0:0:0:0:1]", true],
    ["[::]", true], // unspecified: existing policy treats it as a loopback candidate
    ["[2001:db8::1]", false],
    ["[fe80::1]", false],
  ])("V11-4 isLoopbackHost(%s) is %s", (host, expected) => {
    expect(isLoopbackHost(host)).toBe(expected);
  });
  it("V11-4 the classifier and the scanner use the precise mapped-IPv4 rule", () => {
    expect(verdict("http://[::ffff:7f:1]:56321")).toBe("not-backend");
    expect(verdict("http://[::ffff:7e00:1]:56321")).toBe("not-backend");
    expect(verdict("http://[::ffff:7f00:1]:56321")).toBe("refuse");
    expect(() => attestBuild(withClient('"http://[::ffff:7f:1]:56321"'), {}, CI_API)).not.toThrow();
    refused(() => attestBuild(withClient('"http://[::ffff:7f00:1]:56321"'), {}, CI_API), /different backend/);
  });
});

describe("build attestation: the RUNNING server serves the attested build", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  /** a fake server: path → [status, body] */
  const server = (routes: Record<string, [number, string]>, calls: string[] = []): Fetcher =>
    async (url, init) => {
      expect(init.redirect).toBe("manual");
      const path = new URL(url).pathname;
      calls.push(path);
      const [status, body] = routes[path] ?? [404, "not found"];
      return { status, arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer };
    };
  const files = build();
  const served = (overrides: Record<string, [number, string]> = {}) => ({
    [`/_next/static/${ID}/_buildManifest.js`]: [200, files[`static/${ID}/_buildManifest.js`]] as [number, string],
    "/_next/static/chunks/app/login/page-abc.js": [200, files["static/chunks/app/login/page-abc.js"]] as [number, string],
    ...overrides,
  });

  it("identical bytes for the build manifest and every client file carrying the origin → passes", async () => {
    const a = attestBuild(app(files), {}, CI_API);
    const calls: string[] = [];
    await expect(verifyServedBuild("http://localhost:3000", a, server(served(), calls))).resolves.toBeUndefined();
    expect(calls).toEqual(a.served.map((s) => s.path));
    expect(a.served[0].sha256).toBe(sha(files[`static/${ID}/_buildManifest.js`]));
  });
  it("a server running another build (its manifest is under another BUILD_ID) is refused", async () => {
    const a = attestBuild(app(files), {}, CI_API);
    await expect(verifyServedBuild("http://localhost:3000", a, server(served({ [`/_next/static/${ID}/_buildManifest.js`]: [404, "nf"] })))).rejects.toThrow(/answered .* with 404/);
  });
  it("same paths but different content (e.g. rebuilt for another stack) is refused", async () => {
    const a = attestBuild(app(files), {}, CI_API);
    await expect(
      verifyServedBuild("http://localhost:3000", a, server(served({ "/_next/static/chunks/app/login/page-abc.js": [200, client("http://127.0.0.1:56321")] }))),
    ).rejects.toThrow(/serves a different/);
  });
  it("a redirect, an error or no answer is refused", async () => {
    const a = attestBuild(app(files), {}, CI_API);
    await expect(verifyServedBuild("http://localhost:3000", a, server(served({ [`/_next/static/${ID}/_buildManifest.js`]: [307, ""] })))).rejects.toThrow(/307/);
    await expect(verifyServedBuild("http://localhost:3000", a, server(served({ [`/_next/static/${ID}/_buildManifest.js`]: [500, ""] })))).rejects.toThrow(/500/);
    const down: Fetcher = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    await expect(verifyServedBuild("http://localhost:3000", a, down)).rejects.toThrow(/did not answer/);
  });
  it("only a local http app is accepted, and an empty attestation proves nothing", async () => {
    const a = attestBuild(app(files), {}, CI_API);
    await expect(verifyServedBuild("https://gym.example.com", a, server(served()))).rejects.toThrow(/not a local http server/);
    await expect(verifyServedBuild("not a url", a, server(served()))).rejects.toThrow(/not a valid URL/);
    await expect(verifyServedBuild("http://localhost:3000", { ...a, served: [a.served[0]] }, server(served()))).rejects.toThrow(/nothing to compare/);
  });
});
