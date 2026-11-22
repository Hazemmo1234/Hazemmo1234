import { describe, expect, it } from "vitest";
import { rankParticipants, type BoardSeason } from "@/modules/leaderboard/board";
import { Rational, type ParticipantHistory, type ScoringEntry } from "@/modules/scoring";
import {
  historyBefore,
  liveContent,
  movementOf,
  newBestText,
  preseasonContent,
  resolveTvMode,
  revealWinners,
  seasonNewBests,
  seasonSummary,
  versionMaterial,
  type SnapshotRow,
  type TimedEntry,
  type TvMember,
  type TvSeasonRow,
} from "@/modules/tv/payload";

// M5 TV payload (API_SPECIFICATION "TV", UX section C, BR-X2). Points and ranks come from
// modules/scoring; these tests cover the TV-specific shaping: mode, movement, gaps, new bests,
// privacy allow-list, reveal podium from frozen ranks.

const season = (over: Partial<TvSeasonRow>): TvSeasonRow => ({
  id: "s",
  name: "Arena — March",
  type: "championship",
  starts_on: "2026-03-01",
  ends_on: "2026-03-31",
  closed_at: null,
  reveal_started_at: null,
  ...over,
});

describe("resolveTvMode", () => {
  const next = season({ id: "n", name: "April", starts_on: "2026-04-01", ends_on: "2026-04-30" });

  it("active championship → live; active preseason → preseason", () => {
    expect(resolveTvMode([season({})], "2026-03-10")).toMatchObject({ mode: "live", between: null });
    expect(resolveTvMode([season({ type: "preseason" }), next], "2026-03-10")).toMatchObject({ mode: "preseason", next: { id: "n" } });
  });

  it("ended, not closed → between (awaiting close); never the provisional ranking", () => {
    expect(resolveTvMode([season({}), next], "2026-03-31").mode).toBe("live"); // still the last day
    const after = resolveTvMode([season({ ends_on: "2026-03-30" }), next], "2026-03-31");
    expect(after).toMatchObject({ mode: "between", between: "awaiting_close", season: { id: "s" }, next: { id: "n" } });
  });

  it("closed championship: reveal started → reveal; not started → between (awaiting reveal)", () => {
    const closed = season({ ends_on: "2026-03-30", closed_at: "2026-03-31T08:00:00Z" });
    expect(resolveTvMode([closed], "2026-03-31")).toMatchObject({ mode: "between", between: "awaiting_reveal" });
    expect(resolveTvMode([{ ...closed, reveal_started_at: "2026-03-31T09:00:00Z" }], "2026-03-31")).toMatchObject({ mode: "reveal" });
  });

  it("closed preseason or no season → between (off season)", () => {
    const pre = season({ type: "preseason", ends_on: "2026-03-14", closed_at: "2026-03-15T08:00:00Z" });
    expect(resolveTvMode([pre, next], "2026-03-20")).toMatchObject({ mode: "between", between: "off_season", next: { id: "n" } });
    expect(resolveTvMode([], "2026-03-20")).toMatchObject({ mode: "between", between: "off_season", season: null, next: null });
  });

  it("a running season always wins over an older revealed one", () => {
    const old = season({ id: "o", starts_on: "2026-02-01", ends_on: "2026-02-28", closed_at: "x", reveal_started_at: "y" });
    expect(resolveTvMode([old, season({})], "2026-03-02")).toMatchObject({ mode: "live", season: { id: "s" } });
  });
});

describe("movement (D9, AC-30)", () => {
  const snap = new Map<string, SnapshotRow>([
    ["a", { member_id: "a", rank: 3, total: "120.0000" }],
    ["z", { member_id: "z", rank: 1, total: "0.0000" }],
  ]);
  it("start-of-day rank − current rank; up is positive", () => {
    expect(movementOf("a", 1, snap)).toBe(2);
    expect(movementOf("a", 5, snap)).toBe(-2);
    expect(movementOf("a", 3, snap)).toBe(0);
  });
  it("no invented arrows: no snapshot, no row, or no points at the start of the day → null", () => {
    expect(movementOf("a", 1, null)).toBeNull();
    expect(movementOf("new", 1, snap)).toBeNull();
    expect(movementOf("z", 4, snap)).toBeNull();
  });
  it("historyBefore keeps only what is dated before the day", () => {
    const p: ParticipantHistory = {
      memberId: "a",
      isActive: true,
      plannedSessions: 12,
      entries: [{ category: "treadmill", performedOn: "2026-03-09", km: "2" }, { category: "treadmill", performedOn: "2026-03-10", km: "3" }],
      attendance: [{ attendedOn: "2026-03-09" }, { attendedOn: "2026-03-10" }],
    };
    const before = historyBefore(p, "2026-03-10");
    expect(before.entries.map((e) => e.performedOn)).toEqual(["2026-03-09"]);
    expect(before.attendance.map((a) => a.attendedOn)).toEqual(["2026-03-09"]);
  });
});

describe("new bests", () => {
  const e = (member: string, category: TimedEntry["category"], day: string, values: Partial<TimedEntry>, at: string): TimedEntry => ({
    member_id: member, category, performed_on: day, weight_kg: null, reps: null, km: null, created_at: at, ...values,
  });
  const records = new Map<string, TimedEntry[]>([
    ["a", [
      e("a", "pullups", "2026-02-20", { reps: 10 }, ""), // baseline
      e("a", "pullups", "2026-03-05", { reps: 9 }, "2026-03-05T10:00:00Z"), // not a best
      e("a", "pullups", "2026-03-06", { reps: 12 }, "2026-03-06T10:00:00Z"), // best (+20%)
      e("a", "treadmill", "2026-03-06", { km: "9" }, "2026-03-06T11:00:00Z"), // never a best
    ]],
    ["r", [e("r", "pushups", "2026-03-05", { reps: 30 }, "2026-03-05T09:00:00Z")]], // first value: not a best
    ["x", [e("x", "pullups", "2026-02-01", { reps: 1 }, ""), e("x", "pullups", "2026-03-07", { reps: 5 }, "2026-03-07T10:00:00Z")]], // inactive
  ]);

  it("above the previous highest value incl. the baseline; first values and treadmill never; inactive excluded", () => {
    const bests = seasonNewBests(records, "2026-03-01", (id) => id !== "x");
    expect(bests.map((b) => [b.member_id, b.category, b.value.toFixed(0), b.previous.toFixed(0)])).toEqual([["a", "pullups", "12", "10"]]);
  });

  it("text uses the category name and numbers only", () => {
    expect(newBestText("pullups", Rational.int(10), Rational.int(12))).toBe("Pull-ups +20.0%");
    expect(newBestText("deadlift", Rational.from("100"), Rational.from("112.4"))).toBe("Deadlift +12.4%");
    expect(newBestText("pushups", Rational.ZERO, Rational.int(5))).toBe("Push-ups 0 → 5");
  });
});

describe("liveContent (BR-X2 allow-list, gaps, PR, rookies)", () => {
  const SEASON: BoardSeason = { id: "s", name: "S", type: "championship", starts_on: "2026-03-01", ends_on: "2026-03-28" };
  const tread = (day: string, km: string): ScoringEntry => ({ category: "treadmill", performedOn: day, km });
  const base: ScoringEntry = { category: "pullups", performedOn: "2026-02-10", reps: 5 };
  const p = (id: string, entries: ScoringEntry[], isActive = true): ParticipantHistory => ({ memberId: id, isActive, plannedSessions: 12, entries, attendance: [] });
  const participants = [
    p("a", [base, tread("2026-03-05", "2.5")]),
    p("b", [base, tread("2026-03-06", "2.5")]),
    p("c", [base, tread("2026-03-07", "1")]),
    p("r", [tread("2026-03-05", "3")]),
    p("x", [base, tread("2026-03-05", "9")], false),
  ];
  const members = new Map<string, TvMember>(["a", "b", "c", "r", "x"].map((id) => [id, { full_name: `Member ${id}`, is_active: id !== "x", photo_url: id === "a" ? "https://signed/a" : null }]));
  const records = new Map<string, TimedEntry[]>([
    ["c", [
      { member_id: "c", category: "pullups", performed_on: "2026-02-10", weight_kg: null, reps: 5, km: null, created_at: "" },
      { member_id: "c", category: "pullups", performed_on: "2026-03-07", weight_kg: null, reps: 6, km: null, created_at: "2026-03-07T09:30:00Z" },
    ]],
  ]);
  const out = liveContent({
    standings: rankParticipants(SEASON, participants),
    members,
    records,
    seasonStart: SEASON.starts_on,
    today: "2026-03-07",
    snapshot: null,
    refOf: (id) => `ref-${id}`,
  });

  it("main board: shared ranks, gaps to the row above, inactive never shown", () => {
    expect(out.board.map((r) => [r.ref, r.rank, r.gap_to_next])).toEqual([
      ["ref-a", 1, 0],
      ["ref-b", 1, 0],
      ["ref-c", 3, 6], // 10 − 4 points (treadmill 4 pts per km)
    ]);
    expect(out.board.some((r) => r.ref === "ref-x")).toBe(false);
  });

  it("only allow-listed fields — no member id, phone, coach or evidence", () => {
    for (const row of out.board) {
      expect(Object.keys(row).sort()).toEqual(["categories", "gap_to_next", "initials", "movement", "name", "photo_url", "pr_at", "rank", "ref", "total"]);
    }
    expect(JSON.stringify(out)).not.toMatch(/"a"|member_id|coach|phone|photo_path/);
    expect(out.board[0]).toMatchObject({ photo_url: "https://signed/a", initials: "MA" });
  });

  it("PR time only for today's new bests; rookies listed separately; recent bests in the ticker", () => {
    expect(out.board.find((r) => r.ref === "ref-c")!.pr_at).toBe("2026-03-07T09:30:00Z");
    expect(out.board.find((r) => r.ref === "ref-a")!.pr_at).toBeNull();
    expect(out.rookies.map((r) => [r.ref, r.rank])).toEqual([["ref-r", 1]]);
    expect(out.recent_bests).toEqual([{ ref: "ref-c", name: "Member c", category: "pullups", text: "Pull-ups +20.0%", at: "2026-03-07T09:30:00Z" }]);
  });
});

describe("preseason, reveal, summary, version", () => {
  it("preseason: active participants with at least one baseline, latest first", () => {
    const parts: ParticipantHistory[] = [
      { memberId: "a", isActive: true, plannedSessions: 12, entries: [{ category: "squat", performedOn: "2026-03-02", weightKg: "60", reps: 5 }], attendance: [] },
      { memberId: "b", isActive: true, plannedSessions: 12, entries: [], attendance: [] },
      { memberId: "x", isActive: false, plannedSessions: 12, entries: [{ category: "squat", performedOn: "2026-03-02", weightKg: "60", reps: 5 }], attendance: [] },
    ];
    const members = new Map<string, TvMember>([
      ["a", { full_name: "A", is_active: true, photo_url: null }],
      ["b", { full_name: "B", is_active: true, photo_url: null }],
      ["x", { full_name: "X", is_active: false, photo_url: null }],
    ]);
    const records = new Map<string, TimedEntry[]>([
      ["a", [{ member_id: "a", category: "squat", performed_on: "2026-03-02", weight_kg: "60", reps: 5, km: null, created_at: "2026-03-02T10:00:00Z" }]],
    ]);
    expect(preseasonContent(parts, members, records, "2026-03-01", (id) => `ref-${id}`)).toEqual({
      baselines_logged: 1,
      participants: 2,
      recent: [{ ref: "ref-a", name: "A", category: "squat", at: "2026-03-02T10:00:00Z" }],
    });
  });

  it("reveal winners = frozen ranks 1–3 (ties all shown), never unranked rows", () => {
    const rows = [
      { member_id: "a", rank: 1, total: "800.5000" },
      { member_id: "b", rank: 1, total: "800.5000" },
      { member_id: "c", rank: 3, total: "700.0000" },
      { member_id: "d", rank: 4, total: "600.0000" },
      { member_id: "i", rank: null, total: "900.0000" },
    ];
    const members = new Map(["a", "b", "c", "d", "i"].map((id) => [id, { full_name: id.toUpperCase(), photo_url: null }]));
    expect(revealWinners(rows, members, (id) => id).map((w) => [w.place, w.name, w.total])).toEqual([
      [1, "A", 801],
      [1, "B", 801],
      [3, "C", 700],
    ]);
  });

  it("season summary: days left only while active", () => {
    expect(seasonSummary(season({}), "2026-03-30")).toMatchObject({ days_left: 2 });
    expect(seasonSummary(season({ ends_on: "2026-03-10" }), "2026-03-30")).toMatchObject({ days_left: 0 });
    expect(seasonSummary(null, "2026-03-30")).toBeNull();
  });

  it("version ignores re-issued photo URLs but not a photo appearing", () => {
    const state = (url: string | null) => ({
      locale: "ar" as const, gym_name: "G", mode: "live" as const, season: null, next_season_starts_on: null, next_season_in_days: null, between: null,
      board: [{ ref: "r", rank: 1, name: "N", photo_url: url, initials: "N", total: 1, movement: null, gap_to_next: 0, categories: {} as never, pr_at: null }],
      rookies: [], recent_bests: [], preseason: null, reveal: null,
    });
    expect(versionMaterial(state("https://a?token=1"))).toBe(versionMaterial(state("https://a?token=2")));
    expect(versionMaterial(state(null))).not.toBe(versionMaterial(state("https://a?token=1")));
  });
});
