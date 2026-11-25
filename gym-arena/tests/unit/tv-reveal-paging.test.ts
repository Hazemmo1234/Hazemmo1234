import { describe, expect, it } from "vitest";
import { PAGE_SECONDS, PR_SECONDS, ROWS_PER_PAGE, isFreshPr, pageAt, pageCount, pageRows, splitBoard } from "@/modules/tv/paging";
import { REVEAL_DURATIONS, revealStepAt, revealTimeline } from "@/modules/tv/reveal";

// UX C: live paging (10 rows, every 12 s), PR badge window (60 s), reveal sequence (AC-24).
describe("live board paging", () => {
  const board = Array.from({ length: 25 }, (_, i) => i + 1);
  it("podium = first three rows; ranks 4+ paged by ten", () => {
    const { podium, rest } = splitBoard(board);
    expect(podium).toEqual([1, 2, 3]);
    expect(rest).toHaveLength(22);
    expect(pageCount(rest.length)).toBe(3);
    expect(pageRows(rest, 0)[0]).toBe(4);
    expect(pageRows(rest, 2)).toEqual([24, 25]);
    expect(ROWS_PER_PAGE).toBe(10);
    expect(PAGE_SECONDS).toBe(12);
  });
  it("the page index wraps and stays valid when the board shrinks", () => {
    expect([0, 1, 2, 3, 4].map((t) => pageAt(t, 22))).toEqual([0, 1, 2, 0, 1]);
    expect(pageAt(7, 5)).toBe(0);
    expect(pageCount(0)).toBe(1);
  });
});

describe("PR badge window", () => {
  const at = "2026-03-07T10:00:00.000Z";
  const t0 = Date.parse(at);
  it("shows for 60 s after the new best, server clock", () => {
    expect(isFreshPr(at, t0)).toBe(true);
    expect(isFreshPr(at, t0 + (PR_SECONDS - 1) * 1000)).toBe(true);
    expect(isFreshPr(at, t0 + PR_SECONDS * 1000)).toBe(false);
    expect(isFreshPr(at, t0 - 1000)).toBe(false);
    expect(isFreshPr(null, t0)).toBe(false);
    expect(isFreshPr("not a date", t0)).toBe(false);
  });
});

describe("reveal sequence (AC-24: resumes from the elapsed time)", () => {
  const all = revealTimeline(new Set([1, 2, 3]));
  it("intro → 3rd (8 s) → 2nd (8 s) → drumroll (4 s) → champion → final podium held", () => {
    expect(all.map((s) => s.kind)).toEqual(["intro", "third", "second", "drumroll", "champion", "final"]);
    expect(REVEAL_DURATIONS.third).toBe(8);
    expect(REVEAL_DURATIONS.second).toBe(8);
    expect(REVEAL_DURATIONS.drumroll).toBe(4);
    expect(all.at(-1)!.duration).toBe(Number.POSITIVE_INFINITY);
  });
  it("the step depends only on elapsed seconds — a refreshed TV lands on the same step", () => {
    const third = all.find((s) => s.kind === "third")!;
    expect(revealStepAt(all, 0).step.kind).toBe("intro");
    expect(revealStepAt(all, -5).step.kind).toBe("intro");
    expect(revealStepAt(all, third.startsAt + 1).step.kind).toBe("third");
    expect(revealStepAt(all, third.startsAt + 4).progress).toBeCloseTo(0.5);
    expect(revealStepAt(all, 10_000).step.kind).toBe("final");
  });
  it("places nobody holds are skipped (ties — D10)", () => {
    expect(revealTimeline(new Set([1, 3])).map((s) => s.kind)).toEqual(["intro", "third", "drumroll", "champion", "final"]);
    expect(revealTimeline(new Set()).map((s) => s.kind)).toEqual(["intro", "final"]);
  });
});
