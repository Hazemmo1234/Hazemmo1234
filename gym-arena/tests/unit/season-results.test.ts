import { describe, expect, it } from "vitest";
import { scoreSeason, type ParticipantHistory, type ScoringEntry } from "@/modules/scoring";
import { frozenResultRows } from "@/modules/seasons/results";

// BR-S7, D29: one frozen row per participant — main board ranked, rookies rookie-ranked,
// inactive members scored but never ranked.
const tread = (day: string, km: string): ScoringEntry => ({ category: "treadmill", performedOn: day, km });
const base: ScoringEntry = { category: "pullups", performedOn: "2026-02-10", reps: 5 };
const p = (id: string, entries: ScoringEntry[], isActive = true): ParticipantHistory => ({ memberId: id, isActive, plannedSessions: 12, entries, attendance: [] });

describe("frozenResultRows", () => {
  const participants = [
    p("a", [base, tread("2026-03-05", "2.5"), { category: "pullups", performedOn: "2026-03-06", reps: 6 }]),
    p("b", [base, tread("2026-03-06", "2.5")]),
    p("r", [tread("2026-03-05", "3")]),
    p("x", [base, tread("2026-03-05", "9")], false),
  ];
  const standings = scoreSeason({ type: "championship", startsOn: "2026-03-01", endsOn: "2026-03-28" }, participants);
  const rows = frozenResultRows(standings);

  it("exactly one row per participant", () => {
    expect(rows.map((r) => r.member_id).sort()).toEqual(["a", "b", "r", "x"]);
  });
  it("ranks exactly as scored; rookies on their own list; inactive unranked with their points", () => {
    const by = new Map(rows.map((r) => [r.member_id, r]));
    expect(by.get("a")).toMatchObject({ rank: 1, rookie_rank: null, is_rookie: false });
    expect(by.get("b")).toMatchObject({ rank: 2, rookie_rank: null });
    expect(by.get("r")).toMatchObject({ rank: null, rookie_rank: 1, is_rookie: true });
    expect(by.get("x")).toMatchObject({ rank: null, rookie_rank: null });
    expect(Number(by.get("x")!.total)).toBeGreaterThan(0);
  });
  it("values keep 4 decimals and baselines are recorded for the audit columns", () => {
    const a = rows.find((r) => r.member_id === "a")!;
    expect(a.total).toMatch(/^\d+\.\d{4}$/);
    expect(a.treadmill).toMatch(/^\d+\.\d{4}$/);
    expect(a.baseline_json.pullups).toBe("5.0000");
    expect(a.month_best_json.pullups).toBe("6.0000");
    expect(a.baseline_json.deadlift).toBeNull();
  });
  it("a preseason has no results", () => {
    expect(frozenResultRows(scoreSeason({ type: "preseason", startsOn: "2026-03-01", endsOn: "2026-03-14" }, participants))).toEqual([]);
  });
});
