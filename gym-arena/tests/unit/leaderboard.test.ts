import { describe, expect, it } from "vitest";
import {
  buildFrozenLeaderboard,
  buildLeaderboard,
  countNewBests,
  rankParticipants,
  seasonActivity,
  standingsByMember,
  topOf,
  type BoardMember,
  type BoardSeason,
  type FrozenResultRow,
  type Leaderboard,
  type LeaderboardRow,
} from "@/modules/leaderboard/board";
import type { ParticipantHistory, ScoringEntry } from "@/modules/scoring";

// M4 leaderboard shaping. Points and ranks come from modules/scoring (fully tested there);
// (no attendance here: treadmill points only, 4 × km) these tests cover what board.ts adds: masking, inactive guard, rookies, lookups, Top N with
// ties, new bests and activity.
const SEASON: BoardSeason = { id: "s", name: "Season", type: "championship", starts_on: "2026-03-01", ends_on: "2026-03-28" };
const PRE: BoardSeason = { ...SEASON, type: "preseason" };

const tread = (day: string, km: string): ScoringEntry => ({ category: "treadmill", performedOn: day, km });
const pull = (day: string, reps: number, voided = false): ScoringEntry => ({ category: "pullups", performedOn: day, reps, voided });
const baseline = pull("2026-02-10", 5);

function p(id: string, entries: ScoringEntry[], isActive = true): ParticipantHistory {
  return { memberId: id, isActive, plannedSessions: 12, entries, attendance: [] };
}
function m(id: string, coach: string, extra: Partial<BoardMember> = {}): BoardMember {
  return { id, full_name: `Member ${id}`, coach_id: coach, coach_name: `Coach ${coach}`, is_active: true, photo_url: null, ...extra };
}

const participants = [
  p("a", [baseline, tread("2026-03-05", "2.5")]),
  p("b", [baseline, tread("2026-03-06", "2.5")]), // exact tie with a
  p("c", [baseline, tread("2026-03-07", "2.4")]),
  p("e", [baseline, tread("2026-03-08", "2.6")]),
  p("r", [tread("2026-03-05", "3")]), // no baseline → rookie
  p("x", [baseline, tread("2026-03-05", "5")], false), // inactive → never on a live board
];
const members = new Map(["a", "b", "c", "e", "r", "x"].map((id) => [id, m(id, id === "a" || id === "r" ? "c1" : "c2")]));

describe("buildLeaderboard", () => {
  const standings = rankParticipants(SEASON, participants);

  it("ranks with shared ranks, rookies separate, inactive excluded", () => {
    const board = buildLeaderboard(SEASON, standings, members, { id: "adm", role: "admin" });
    expect(board.main.map((r) => [r.member_id, r.rank])).toEqual([["e", 1], ["a", 2], ["b", 2], ["c", 4]]);
    expect(board.rookies.map((r) => [r.member_id, r.rank, r.is_rookie])).toEqual([["r", 1, true]]);
    expect([...board.main, ...board.rookies].some((r) => r.member_id === "x")).toBe(false);
    expect(board.main[1].total).toBe(board.main[2].total);
    expect(board.main[0]).toMatchObject({ total_display: 10, own: false, coach_name: "Coach c2" });
    expect(Object.keys(board.main[0].categories).sort()).toEqual(["bench", "consistency", "deadlift", "pullups", "pushups", "squat", "treadmill"]);
  });

  it("a coach sees every row, but ids only for their own clients", () => {
    const board = buildLeaderboard(SEASON, standings, members, { id: "c1", role: "coach" });
    expect(board.main).toHaveLength(4);
    for (const r of [...board.main, ...board.rookies]) {
      if (r.own) expect(["a", "r"]).toContain(r.member_id);
      else expect(r.member_id).toBeNull();
    }
    expect(board.main.filter((r) => r.own)).toHaveLength(1);
    expect(board.rookies[0].own).toBe(true);
  });

  it("a coach gets photos only for own clients (a signed URL would reveal the member id)", () => {
    const withPhotos = new Map([...members].map(([id, x]) => [id, { ...x, photo_url: `https://x/avatars/members/${id}/p.webp?token=t` }]));
    const coach = buildLeaderboard(SEASON, standings, withPhotos, { id: "c1", role: "coach" });
    for (const r of [...coach.main, ...coach.rookies]) expect(r.photo_url === null).toBe(!r.own);
    const admin = buildLeaderboard(SEASON, standings, withPhotos, { id: "adm", role: "admin" });
    expect([...admin.main, ...admin.rookies].every((r) => r.photo_url !== null)).toBe(true);
  });

  it("second guard: a member marked inactive is dropped even if scoring ranked them; unknown ids too", () => {
    const flipped = new Map(members);
    flipped.set("e", m("e", "c2", { is_active: false }));
    flipped.delete("c");
    const board = buildLeaderboard(SEASON, standings, flipped, { id: "adm", role: "admin" });
    expect(board.main.map((r) => r.member_id)).toEqual(["a", "b"]);
  });

  it("preseason: no ranking at all", () => {
    const board = buildLeaderboard(PRE, rankParticipants(PRE, participants), members, { id: "adm", role: "admin" });
    expect(board).toEqual({ season: PRE, final: false, main: [], rookies: [] });
  });
});

describe("standingsByMember", () => {
  it("rank, list and list size per member — same numbers as the board", () => {
    const s = standingsByMember(rankParticipants(SEASON, participants));
    expect(s.get("e")).toEqual({ rank: 1, of: 4, list: "main", total: 10.4, total_display: 10 });
    expect(s.get("b")).toMatchObject({ rank: 2, of: 4, list: "main" });
    expect(s.get("r")).toMatchObject({ rank: 1, of: 1, list: "rookies" });
    expect(s.has("x")).toBe(false);
  });
});

describe("topOf", () => {
  const row = (rank: number): LeaderboardRow => ({
    rank, member_id: null, own: false, full_name: "", photo_url: null, coach_name: null, is_rookie: false,
    total: 0, total_display: 0, improvement_points: 0, categories: { deadlift: 0, bench: 0, squat: 0, pullups: 0, pushups: 0, treadmill: 0, consistency: 0 },
  });
  const board = (ranks: number[]): Leaderboard => ({ season: SEASON, final: false, main: ranks.map(row), rookies: [] });

  it("first n rows plus how many more share the last shown rank (D10)", () => {
    expect(topOf(board([1, 2, 3, 4, 5, 5, 5, 8]), 5)).toMatchObject({ moreTied: 2 });
    expect(topOf(board([1, 2, 3, 4, 5, 6]), 5)).toMatchObject({ moreTied: 0 });
    expect(topOf(board([1, 1]), 5)).toMatchObject({ moreTied: 0 });
    expect(topOf(board([]), 5)).toEqual({ rows: [], moreTied: 0 });
    expect(topOf(board([1, 2, 3, 4, 5, 5, 5, 8]), 5).rows).toHaveLength(5);
  });
});

describe("countNewBests (scoring README definition)", () => {
  it("counts values above the previous best, baseline included; first-ever, voided and treadmill never count", () => {
    expect(countNewBests([p("a", [pull("2026-02-01", 5), pull("2026-03-02", 6), pull("2026-03-03", 6), pull("2026-03-04", 8)])], SEASON.starts_on)).toBe(2);
    // first-ever value in season: not a new best; the next higher one is
    expect(countNewBests([p("a", [pull("2026-03-02", 6), pull("2026-03-05", 7)])], SEASON.starts_on)).toBe(1);
    // a voided higher value is ignored entirely
    expect(countNewBests([p("a", [pull("2026-02-01", 5), pull("2026-03-02", 9, true), pull("2026-03-03", 6)])], SEASON.starts_on)).toBe(1);
    // not above the pre-season best
    expect(countNewBests([p("a", [pull("2026-02-01", 9), pull("2026-03-02", 8)])], SEASON.starts_on)).toBe(0);
    // pre-season improvements are not this season's
    expect(countNewBests([p("a", [pull("2026-01-01", 3), pull("2026-02-01", 9)])], SEASON.starts_on)).toBe(0);
    // treadmill never
    expect(countNewBests([p("a", [tread("2026-02-01", "1"), tread("2026-03-02", "5")])], SEASON.starts_on)).toBe(0);
    // unordered input is ordered by day
    expect(countNewBests([p("a", [pull("2026-03-04", 8), pull("2026-02-01", 5)])], SEASON.starts_on)).toBe(1);
  });
});

describe("seasonActivity", () => {
  it("entries per category in season; active participants with an entry in the last 7 days", () => {
    const a = seasonActivity(
      [
        p("a", [baseline, pull("2026-03-10", 6), tread("2026-03-20", "2")]),
        p("b", [pull("2026-03-12", 6, true), tread("2026-03-13", "1")]), // only a voided entry in the window
        p("c", [pull("2026-03-21", 7)], false), // inactive: counted in entries, not in activity
        p("d", []),
      ],
      SEASON.starts_on, "2026-03-14", "2026-03-20",
    );
    expect(a.entriesPerCategory).toEqual({ deadlift: 0, bench: 0, squat: 0, pullups: 2, pushups: 0, treadmill: 2 });
    expect(a).toMatchObject({ activeLast7Days: 1, activeParticipants: 3 });
  });

  it("K3: the window is the last 7 Cairo calendar days, today included (today − 6 … today)", () => {
    const today = "2026-03-20";
    const windowStart = "2026-03-14"; // addDays(today, -6), as the dashboard passes it
    const on = (day: string) => seasonActivity([p("a", [pull(day, 6)])], SEASON.starts_on, windowStart, today).activeLast7Days;
    expect(on("2026-03-20")).toBe(1); // today counts
    expect(on("2026-03-14")).toBe(1); // 6 days ago: first day of the window
    expect(on("2026-03-13")).toBe(0); // 7 days ago: outside
    expect(on("2026-03-21")).toBe(0); // never the future
  });
});

describe("buildFrozenLeaderboard (K1: closed seasons show frozen results)", () => {
  const z = { deadlift: "0", bench: "0", squat: "0", pullups: "0", pushups: "0", treadmill: "0", consistency: "0", improvement_points: "0" };
  const fr = (member_id: string, total: string, rank: number | null, rookie_rank: number | null = null, member_active = true): FrozenResultRow =>
    ({ ...z, member_id, is_rookie: rookie_rank !== null, total, rank, rookie_rank, member_active });
  const results = [
    fr("b", "100.5000", 2),
    fr("a", "726.4999", 1),
    fr("c", "100.5000", 2),
    fr("r", "50.0000", null, 1),
    fr("x", "900.0000", null, null, false), // inactive AT CLOSE: stored unranked
  ];
  // "a" is inactive NOW (deactivated after the close) — must not change the final board
  const frozenMembers = new Map([...members].map(([id, x]) => [id, id === "a" ? { ...x, is_active: false } : x]));

  it("uses the stored ranks and totals, never today's status; unranked-at-close rows are not shown", () => {
    const board = buildFrozenLeaderboard(SEASON, results, frozenMembers, { id: "adm", role: "admin" });
    expect(board.final).toBe(true);
    expect(board.main.map((r) => [r.member_id, r.rank])).toEqual([["a", 1], ["b", 2], ["c", 2]]);
    expect(board.rookies.map((r) => [r.member_id, r.rank, r.is_rookie])).toEqual([["r", 1, true]]);
    expect([...board.main, ...board.rookies].some((r) => r.member_id === "x")).toBe(false);
    expect(board.main[0]).toMatchObject({ total: 726.5, total_display: 726 }); // exact stored value, half-up
    expect(board.main[1]).toMatchObject({ total: 100.5, total_display: 101 });
  });

  it("same privacy rules as the live board for a coach", () => {
    const withPhotos = new Map([...frozenMembers].map(([id, x]) => [id, { ...x, photo_url: `https://x/avatars/members/${id}/p.webp` }]));
    const board = buildFrozenLeaderboard(SEASON, results, withPhotos, { id: "c1", role: "coach" });
    for (const r of [...board.main, ...board.rookies]) {
      expect(r.member_id === null).toBe(!r.own);
      expect(r.photo_url === null).toBe(!r.own);
    }
    expect(board.main.find((r) => r.own)?.rank).toBe(1); // "a" belongs to coach c1
  });

  it("shared rank with identical names: a stable order by id (presentation only)", () => {
    const same = new Map([...frozenMembers].map(([id, x]) => [id, { ...x, full_name: "Same Name" }]));
    const board = buildFrozenLeaderboard(SEASON, [fr("c", "1", 1), fr("b", "1", 1)], same, { id: "adm", role: "admin" });
    expect(board.main.map((r) => r.member_id)).toEqual(["b", "c"]);
    const reversed = buildFrozenLeaderboard(SEASON, [fr("b", "1", 1), fr("c", "1", 1)], same, { id: "adm", role: "admin" });
    expect(reversed.main.map((r) => r.member_id)).toEqual(["b", "c"]); // input order does not matter
  });

  it("a result whose member row is missing is skipped; a closed preseason (no results) is empty", () => {
    expect(buildFrozenLeaderboard(SEASON, [fr("ghost", "1", 1)], frozenMembers, { id: "adm", role: "admin" }).main).toEqual([]);
    expect(buildFrozenLeaderboard(PRE, [], frozenMembers, { id: "adm", role: "admin" })).toEqual({ season: PRE, final: true, main: [], rookies: [] });
  });
});
