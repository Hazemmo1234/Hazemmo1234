import { describe, expect, it } from "vitest";
import { rankParticipants } from "@/modules/leaderboard/board";
import type { ParticipantHistory, ScoringEntry } from "@/modules/scoring";
import { liveContent, type TimedEntry, type TvMember } from "@/modules/tv/payload";

// M7 performance pass: the TV recomputes the whole season (cached 5 s per process). Measured at
// 1 200 participants × 31 entries: ≈ 50 ms scoring + ≈ 45 ms TV shaping. The budget below is
// deliberately generous (slow CI machines); it catches an accidental O(n²), not noise.
describe("TV state at gym scale (> 1000 participants)", () => {
  it("ranks and shapes 1 200 participants well within one poll", () => {
    const cats = ["deadlift", "bench", "squat", "pullups", "pushups", "treadmill"] as const;
    const value = (c: (typeof cats)[number], i: number, d: number) =>
      c === "treadmill" ? { km: "4.2" } : c === "pullups" || c === "pushups" ? { reps: 10 + (i % 7) + (d % 4) } : { weightKg: String(60 + (i % 40) + (d % 5)), reps: 5 };
    const parts: ParticipantHistory[] = [];
    const records = new Map<string, TimedEntry[]>();
    const members = new Map<string, TvMember>();
    for (let i = 0; i < 1200; i++) {
      const id = `m${i}`;
      const entries: ScoringEntry[] = [];
      const rec: TimedEntry[] = [];
      for (let d = 0; d <= 25; d++) {
        for (const c of d === 0 ? cats : [cats[(i + d) % 6]!]) {
          const day = d === 0 ? "2026-02-15" : `2026-03-${String(d).padStart(2, "0")}`;
          const v = value(c, i, d) as { weightKg?: string; reps?: number; km?: string };
          entries.push({ category: c, performedOn: day, ...v });
          rec.push({ member_id: id, category: c, performed_on: day, weight_kg: v.weightKg ?? null, reps: v.reps ?? null, km: v.km ?? null, created_at: d === 0 ? "" : `${day}T10:00:00Z` });
        }
      }
      parts.push({ memberId: id, isActive: true, plannedSessions: 12, entries, attendance: [] });
      records.set(id, rec);
      members.set(id, { full_name: `Member ${i}`, is_active: true, photo_url: null });
    }
    const season = { id: "s", name: "S", type: "championship" as const, starts_on: "2026-03-01", ends_on: "2026-03-31" };
    const t0 = performance.now();
    const out = liveContent({ standings: rankParticipants(season, parts), members, records, seasonStart: season.starts_on, today: "2026-03-25", snapshot: null, refOf: (x) => x });
    const ms = performance.now() - t0;
    expect(out.board).toHaveLength(1200);
    expect(out.recent_bests.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(3000);
  });
});
