import type { Page } from "@playwright/test";

/**
 * How a name that may be cut (src/components/name-text.tsx) is actually shown — real browser
 * geometry, because Playwright's toBeVisible() passes for clipped text.
 *  - dir: the element's own direction (follows the name's script);
 *  - cut: the name does not fit (scrollWidth > clientWidth); ellipsis: text-overflow is "…";
 *  - firstVisible / lastVisible: the name's first / last letter lies inside the element's box;
 *  - cutAtEnd: the last letter lies past the END edge for the name's direction (right for a
 *    Latin name, left for an Arabic one), i.e. the cut and the "…" are at the end of the name;
 *  - startGap: px between the text and the start edge of the SURROUNDING layout (the parent's
 *    direction): ~0 means the line still aligns like the rest of the screen.
 */
export interface NameShown {
  text: string;
  dir: string;
  cut: boolean;
  ellipsis: boolean;
  firstVisible: boolean;
  lastVisible: boolean;
  cutAtEnd: boolean;
  startGap: number;
}

export function namesShown(page: Page, selector: string): Promise<NameShown[]> {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect();
      const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      const t = node?.textContent ?? "";
      const first = t.search(/\S/);
      const last = t.trimEnd().length - 1;
      const rect = (a: number, b: number) => {
        const r = document.createRange();
        r.setStart(node!, a);
        r.setEnd(node!, b);
        return r.getBoundingClientRect();
      };
      const f = rect(first, first + 1);
      const l = rect(last, last + 1);
      const all = rect(first, last + 1);
      const inside = (r: DOMRect) => r.left >= box.left - 1 && r.right <= box.right + 1;
      const dir = getComputedStyle(el).direction;
      const parentDir = el.parentElement ? getComputedStyle(el.parentElement).direction : dir;
      return {
        text: t.trim(),
        dir,
        cut: el.scrollWidth > el.clientWidth + 1,
        ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
        firstVisible: inside(f),
        lastVisible: inside(l),
        cutAtEnd: dir === "ltr" ? l.right > box.right + 1 : l.left < box.left - 1,
        startGap: Math.round(parentDir === "rtl" ? box.right - all.right : all.left - box.left),
      };
    }),
  );
}

/** Long names: cut at the END in their own direction, the beginning visible. */
export function cutAtEndProblems(n: NameShown, dir: "ltr" | "rtl"): string[] {
  const out: string[] = [];
  if (n.dir !== dir) out.push(`direction ${n.dir}, expected ${dir}`);
  if (!n.cut) out.push("expected to be cut (test name too short for this layout?)");
  if (!n.ellipsis) out.push("no ellipsis");
  if (!n.firstVisible) out.push("beginning of the name hidden");
  if (!n.cutAtEnd) out.push("not cut at the end of the name");
  return out.map((p) => `"${n.text.slice(0, 24)}": ${p}`);
}

/** Short names: shown whole, in their own direction. */
export function wholeProblems(n: NameShown, dir: "ltr" | "rtl"): string[] {
  const out: string[] = [];
  if (n.dir !== dir) out.push(`direction ${n.dir}, expected ${dir}`);
  if (n.cut) out.push("cut although it fits");
  if (!n.firstVisible || !n.lastVisible) out.push("not fully visible");
  return out.map((p) => `"${n.text.slice(0, 24)}": ${p}`);
}
