import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// The fonts are self-hosted (src/assets/fonts/README.md): a build must never depend on Google
// Fonts again. These checks fail if remote font loading comes back or the assets/licences go.
const APP = join(__dirname, "..", "..");
const REMOTE = /next\/font\/google|fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net|fonts\.bunny\.net/;

function codeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return codeFiles(p);
    return /\.(ts|tsx|js|mjs|cjs|css)$/.test(name) ? [p] : [];
  });
}

describe("self-hosted fonts", () => {
  it("no source file loads fonts from a remote service", () => {
    const files = [...codeFiles(join(APP, "src")), join(APP, "next.config.ts")];
    expect(files.length).toBeGreaterThan(50);
    const offenders = files.filter((f) => REMOTE.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("fonts.ts uses next/font/local with the existing variables and existing files", () => {
    const source = readFileSync(join(APP, "src/app/fonts.ts"), "utf8");
    expect(source).toContain('from "next/font/local"');
    expect(source).toContain('variable: "--font-cairo"');
    expect(source).toContain('variable: "--font-barlow"');
    const paths = [...source.matchAll(/path: "([^"]+)"/g)].map((m) => m[1]!);
    expect(new Set(paths)).toEqual(
      new Set([
        "../assets/fonts/cairo/Cairo-Variable.woff2",
        "../assets/fonts/barlow-condensed/BarlowCondensed-BoldItalic.woff2",
        "../assets/fonts/barlow-condensed/BarlowCondensed-ExtraBoldItalic.woff2",
      ]),
    );
    for (const p of paths) {
      const file = resolve(APP, "src/app", p);
      expect(existsSync(file), p).toBe(true);
      expect(readFileSync(file).subarray(0, 4).toString("latin1"), p).toBe("wOF2");
    }
    // the weights and styles Google Fonts served: Cairo 400/600/700/800, Barlow Condensed italic 700/800
    expect([...source.matchAll(/weight: "(\d+)", style: "(\w+)"/g)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "400 normal", "600 normal", "700 normal", "800 normal", "700 italic", "800 italic",
    ]);
  });

  it("each family ships its official SIL Open Font License text", () => {
    const licences: Array<[string, string]> = [
      ["cairo", "Copyright 2009 The Cairo Project Authors (https://github.com/Gue3bara/Cairo)"],
      ["barlow-condensed", "Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)"],
    ];
    for (const [dir, copyright] of licences) {
      const text = readFileSync(join(APP, "src/assets/fonts", dir, "OFL.txt"), "utf8");
      expect(text.startsWith(copyright), dir).toBe(true);
      expect(text).toContain("SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007");
    }
  });

  it("the styles still use the same font variables, and the CSP allows no remote font origin", () => {
    const css = readFileSync(join(APP, "src/app/globals.css"), "utf8");
    expect(css).toContain("var(--font-cairo)");
    expect(css).toContain("var(--font-barlow)");
    expect(readFileSync(join(APP, "next.config.ts"), "utf8")).toContain(`"font-src 'self' data:"`);
  });
});
