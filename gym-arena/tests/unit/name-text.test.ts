import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

// Names are cut at their END in either script (D15; e2e/tv.spec.ts and e2e/names.spec.ts check
// the real geometry). The mechanism: the cut-able element itself carries dir="auto" (no inner
// <bdi> — dir="auto" ignores text inside one) and text-align: match-parent.

const ROOT = join(__dirname, "..", "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

describe("NameText", () => {
  // (the unit runner does not compile JSX; the real rendering is covered by the browser tests)
  it("puts dir=auto, the cut and the alignment class on the element holding the name — no bdi", () => {
    const src = readFileSync(join(ROOT, "src", "components", "name-text.tsx"), "utf8");
    const el = src.match(/<Tag\b[^>]*>\s*\{children\}\s*<\/Tag>/);
    expect(el, "NameText renders {children} directly inside <Tag>").not.toBeNull();
    expect(el![0]).toMatch(/\bdir="auto"/);
    expect(el![0]).toMatch(/className=\{`name-text truncate \$\{className\}`\}/);
    expect(src.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/<bdi/);
  });

  it("the stylesheet keeps both spellings of match-parent, below the utilities", () => {
    const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
    const rule = css.match(/@layer components \{\s*\.name-text \{([^}]*)\}/);
    expect(rule, ".name-text in @layer components").not.toBeNull();
    // Chromium knows only the prefixed value, Safari ≥ 15.4 / Firefox the standard one
    expect(rule![1]).toMatch(/text-align: -webkit-match-parent;\s*text-align: match-parent;/);
  });
});

describe("every cut person name uses NameText", () => {
  const PERSON = /\{[^}]*\b(full_name|member_name|coach_name|fullName)\b[^}]*\}/;
  const TV_PERSON = /\{(row|r|w)\.name\}/; // TV board rows, rookies and winners
  const files = tsxFiles(join(ROOT, "src")).map((f) => relative(ROOT, f).split(sep).join("/"));

  it("there are files to check", () => expect(files.length).toBeGreaterThan(40));

  it.each(files)("%s: no plain element both cuts text and shows a person's name", (file) => {
    const src = readFileSync(join(ROOT, file), "utf8");
    // a lowercase (HTML) element whose class list contains `truncate`, and what it contains
    for (const m of src.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\btruncate\b[^>]*)>([\s\S]*?)<\/\1>/g)) {
      const inner = m[3]!;
      const person = PERSON.test(inner) || (file.includes("components/tv/") && TV_PERSON.test(inner));
      expect(person, `${file}: <${m[1]} …truncate…> shows a person's name — use <NameText>`).toBe(false);
    }
  });
});
