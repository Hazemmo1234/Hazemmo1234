import { describe, expect, it } from "vitest";
import { normalizeNumberInput } from "@/lib/number-input";
import { chunk, fetchAll, PAGE_SIZE } from "@/lib/supabase/fetch-all";
import { createEntrySchema, evidenceUploadSchema, previewEntrySchema, voidEntrySchema } from "@/lib/validation/entries";
import {
  buildMemberCard,
  buildPreview,
  formatValue,
  participantHistory,
  photoRequiredFor,
  type CardSeason,
  type EntryRecord,
} from "@/modules/entries/card";
import {
  EVIDENCE_ATTACH_WINDOW_MS,
  EVIDENCE_CLEANUP_GRACE_MS,
  cleanupEvidence,
  evidenceFolder,
  isAttachableEvidence,
  isEvidencePath,
  type EvidenceCleanupDeps,
} from "@/modules/entries/evidence";
import { Rational, scoreSeason } from "@/modules/scoring";

const SEASON: CardSeason = { id: "00000000-0000-4000-b000-000000000002", name: "S", type: "championship", starts_on: "2026-11-01", ends_on: "2026-11-30", status: "active", days_left: 16 };
const M = "00000000-0000-4000-c000-000000000003";
const ME = "00000000-0000-4000-a000-000000000011";
const OTHER = "00000000-0000-4000-a000-000000000001";
const TODAY = "2026-11-15";
let n = 0;
const entry = (p: Partial<EntryRecord>): EntryRecord => ({
  id: `e${++n}`, member_id: M, category: "deadlift", performed_on: TODAY, weight_kg: null, reps: null, km: null,
  photo_path: null, logged_by: ME, created_at: `2026-11-15T10:00:${String(n).padStart(2, "0")}Z`, voided_at: null, ...p,
});

describe("member card (built only from modules/scoring)", () => {
  const baseline = entry({ performed_on: "2026-10-20", weight_kg: "100", reps: 5 }); // e1RM 116.67
  const best = entry({ performed_on: "2026-11-10", weight_kg: "105", reps: 5 }); // e1RM 122.5
  const todayPull = entry({ category: "pullups", reps: 8 });
  const voided = entry({ category: "pushups", reps: 30, voided_at: "2026-11-15T11:00:00Z" });
  const byAdmin = entry({ category: "treadmill", km: "3", logged_by: OTHER });
  const entries = [baseline, best, todayPull, voided, byAdmin];
  const attendance = [
    { member_id: M, attended_on: "2026-11-10", voided_at: null },
    { member_id: M, attended_on: TODAY, voided_at: null },
  ];
  const history = participantHistory(M, 10, entries, attendance);
  const card = buildMemberCard({ season: SEASON, history, entries, today: TODAY, viewerId: ME });

  it("the total equals the scoring module's own total for the same data", () => {
    const standings = scoreSeason({ type: "championship", startsOn: SEASON.starts_on, endsOn: SEASON.ends_on }, [history]);
    const row = [...standings.main, ...standings.rookies][0];
    expect(card.total).toBe(Number(row.total.toFixed(2)));
    expect(card.total_display).toBe(row.total.roundHalfUp());
    expect(card.is_rookie).toBe(false);
  });

  it("tiles: baseline → best, logged today (voided ignored), treadmill credited km", () => {
    const dl = card.categories.find((c) => c.code === "deadlift")!;
    expect(dl).toMatchObject({ baseline: "116.7", month_best: "122.5", has_baseline: true, logged_today: false, max: 100 });
    expect(card.categories.find((c) => c.code === "pullups")!.logged_today).toBe(true);
    expect(card.categories.find((c) => c.code === "pushups")!.logged_today).toBe(false);
    expect(card.categories.find((c) => c.code === "treadmill")).toMatchObject({ month_best: "3.0", has_baseline: false, points: 12 });
    expect(card).toMatchObject({ attended: 2, planned_sessions: 10, attended_today: true });
  });

  it("today's entries: newest first; undo only for my own, not voided, same day (BR-E9)", () => {
    expect(card.today_entries.map((e) => e.id)).toEqual([byAdmin.id, voided.id, todayPull.id]);
    expect(card.today_entries.find((e) => e.id === todayPull.id)!.can_undo).toBe(true);
    expect(card.today_entries.find((e) => e.id === voided.id)).toMatchObject({ voided: true, can_undo: false });
    expect(card.today_entries.find((e) => e.id === byAdmin.id)!.can_undo).toBe(false);
  });

  it("preseason: no points anywhere (SCORING §6)", () => {
    const pre = buildMemberCard({ season: { ...SEASON, type: "preseason" }, history, entries, today: TODAY, viewerId: ME });
    expect(pre.total).toBe(0);
    expect(pre.categories.every((c) => c.points === 0)).toBe(true);
    expect(pre.consistency.points).toBe(0);
  });

  it("between seasons: an empty card that still shows today's entries", () => {
    const none = buildMemberCard({ season: null, history, entries, today: TODAY, viewerId: ME });
    expect(none).toMatchObject({ season: null, total: 0, is_rookie: false });
    expect(none.categories).toHaveLength(6);
    expect(none.today_entries).toHaveLength(3);
  });

  it("a rookie builds baselines; a capped category is flagged", () => {
    const rookie = participantHistory(M, 12, [entry({ performed_on: "2026-11-05", weight_kg: "80", reps: 5 })], []);
    const rc = buildMemberCard({ season: SEASON, history: rookie, entries: [], today: TODAY, viewerId: ME });
    expect(rc.is_rookie).toBe(true);
    expect(rc.categories.find((c) => c.code === "deadlift")!.has_baseline).toBe(false);

    const capped = [entry({ performed_on: "2026-10-01", category: "pullups", reps: 5 }), entry({ performed_on: "2026-11-02", category: "pullups", reps: 10 })];
    const cc = buildMemberCard({ season: SEASON, history: participantHistory(M, 12, capped, []), entries: capped, today: TODAY, viewerId: ME });
    expect(cc.categories.find((c) => c.code === "pullups")).toMatchObject({ at_cap: true, points: 150 });
    const km = Array.from({ length: 10 }, (_, i) => entry({ category: "treadmill", km: "5", performed_on: `2026-11-${String(i + 1).padStart(2, "0")}` }));
    const tc = buildMemberCard({ season: SEASON, history: participantHistory(M, 12, km, []), entries: km, today: TODAY, viewerId: ME });
    expect(tc.categories.find((c) => c.code === "treadmill")).toMatchObject({ at_cap: true, month_best: "50.0", points: 200 });
  });
});

describe("entry preview and the photo rule (SCORING §6)", () => {
  const b = entry({ performed_on: "2026-10-20", category: "pullups", reps: 5 });
  const history = participantHistory(M, 12, [b], []);

  it("a new best needs a photo and shows the points; a lower result does not", () => {
    const up = buildPreview({ season: SEASON, history, entry: { category: "pullups", reps: 7 }, date: TODAY });
    expect(up.ok && up.preview).toMatchObject({ value: "7", is_new_best: true, photo_required: true, points_before: 0, points_after: 60 });
    const down = buildPreview({ season: SEASON, history, entry: { category: "pullups", reps: 4 }, date: TODAY });
    expect(down.ok && down.preview).toMatchObject({ is_new_best: false, photo_required: false, points_after: 0 });
    // the server check uses the same function
    expect(photoRequiredFor(SEASON, history, { category: "pullups", reps: 7 })).toBe(true);
    expect(photoRequiredFor(SEASON, history, { category: "pullups", reps: 4 })).toBe(false);
    expect(photoRequiredFor({ ...SEASON, type: "preseason" }, history, { category: "pullups", reps: 7 })).toBe(false);
  });

  it("the delta includes the attendance the save records (BR-E7)", () => {
    const fresh = participantHistory(M, 12, [], []);
    const p = buildPreview({ season: SEASON, history: fresh, entry: { category: "treadmill", km: "3" }, date: TODAY });
    expect(p.ok && p.preview).toMatchObject({ points_before: 0, points_after: 12, points_delta: 28.67, points_delta_display: 29, total_after_display: 29, photo_required: true });
  });

  it("AC-14: once 50 km are credited, a treadmill entry needs no photo", () => {
    const km = Array.from({ length: 10 }, (_, i) => entry({ category: "treadmill", km: "5", performed_on: `2026-11-${String(i + 1).padStart(2, "0")}` }));
    const full = participantHistory(M, 12, km, []);
    expect(photoRequiredFor(SEASON, full, { category: "treadmill", km: "5" })).toBe(false);
    const almost = participantHistory(M, 12, km.slice(1), []);
    expect(photoRequiredFor(SEASON, almost, { category: "treadmill", km: "5" })).toBe(true);
  });

  it("display points are rounded once, half-up from the exact value (never double-rounded)", () => {
    // bench e1RM 70 → 70.8333…: +1.1905 % → 7.9365… points → shown as 8, stored with 2 decimals as 7.94
    const hist = participantHistory(M, 12, [
      entry({ performed_on: "2026-10-20", category: "bench", weight_kg: "60", reps: 5 }),
      entry({ performed_on: "2026-11-05", category: "bench", weight_kg: "62.5", reps: 4 }),
    ], []);
    const c = buildMemberCard({ season: SEASON, history: hist, entries: [], today: TODAY, viewerId: ME });
    const bench = c.categories.find((t) => t.code === "bench")!;
    expect(bench).toMatchObject({ points: 7.94, points_display: 8 });
    expect(c.consistency).toMatchObject({ points: 0, points_display: 0 });
  });

  it("invalid input returns the scoring module's own error codes", () => {
    const r = buildPreview({ season: SEASON, history, entry: { category: "deadlift", weightKg: "100.3", reps: 5 }, date: TODAY });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toEqual({ field: "weightKg", code: "STEP" });
  });

  it("formatValue: e1RM and km 1 decimal, reps integer", () => {
    expect(formatValue("deadlift", Rational.from("110.8333"))).toBe("110.8");
    expect(formatValue("treadmill", Rational.from("3"))).toBe("3.0");
    expect(formatValue("pullups", Rational.int(7))).toBe("7");
  });
});

describe("evidence photos (BR-X3)", () => {
  const S = "00000000-0000-4000-b000-000000000002";
  const file = (id: string) => `entries/${S}/${M}/${id}.webp`;
  const F1 = file("11111111-1111-4111-8111-111111111111");
  const F2 = file("22222222-2222-4222-8222-222222222222");
  const now = new Date("2026-11-15T12:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);

  it("paths: only this season's folder for this member", () => {
    expect(evidenceFolder(S, M)).toBe(`entries/${S}/${M}`);
    expect(isEvidencePath(F1, S, M)).toBe(true);
    expect(isEvidencePath(F1.replace(".webp", ".jpg"), S, M)).toBe(true);
    expect(isEvidencePath(F1, S, "00000000-0000-4000-c000-000000000009")).toBe(false);
    expect(isEvidencePath(`${F1}/../x.webp`, S, M)).toBe(false);
    expect(isEvidencePath(F1.replace(".webp", ".png"), S, M)).toBe(false);
    expect(isEvidencePath(`avatars/${F1}`, S, M)).toBe(false);
  });

  it("only fresh uploads can be attached; the windows never overlap", () => {
    expect(EVIDENCE_ATTACH_WINDOW_MS).toBeLessThan(EVIDENCE_CLEANUP_GRACE_MS);
    expect(isAttachableEvidence({ path: F1, createdAt: ago(10) }, now)).toBe(true);
    expect(isAttachableEvidence({ path: F1, createdAt: ago(16) }, now)).toBe(false);
  });

  function deps(files: Array<{ path: string; createdAt: Date }>, referenced: string[], fail?: string): EvidenceCleanupDeps & { removed: string[] } {
    const removed: string[] = [];
    return {
      removed,
      async listFolder() { if (fail === "list") throw new Error("list failed"); return files; },
      async referencedPaths(paths) { if (fail === "refs") throw new Error("refs failed"); return new Set(paths.filter((p) => referenced.includes(p))); },
      async remove(paths) { if (fail === "remove") throw new Error("remove failed"); removed.push(...paths); },
    };
  }

  it("cleanup removes only old, unreferenced files; voided entries keep their photo", async () => {
    const d = deps([{ path: F1, createdAt: ago(120) }, { path: F2, createdAt: ago(120) }], [F2]);
    expect(await cleanupEvidence(evidenceFolder(S, M), now, d)).toEqual({ removed: [F1] });
    const young = deps([{ path: F1, createdAt: ago(30) }], []);
    expect(await cleanupEvidence(evidenceFolder(S, M), now, young)).toEqual({ removed: [] });
    const allUsed = deps([{ path: F1, createdAt: ago(120) }], [F1]);
    expect(await cleanupEvidence(evidenceFolder(S, M), now, allUsed)).toEqual({ removed: [] });
  });

  for (const step of ["list", "refs", "remove"]) {
    it(`a failing ${step} step is reported, never thrown`, async () => {
      const d = deps([{ path: F1, createdAt: ago(120) }], [], step);
      expect(await cleanupEvidence(evidenceFolder(S, M), now, d)).toEqual({ removed: [], error: `${step} failed` });
    });
  }
  it("non-Error failures are reported too", async () => {
    const d: EvidenceCleanupDeps = { listFolder: () => Promise.reject("x"), referencedPaths: async () => new Set(), remove: async () => {} };
    expect(await cleanupEvidence("f", now, d)).toEqual({ removed: [], error: "cleanup_failed" });
  });
});

describe("entries API input shapes", () => {
  const id = M;
  it("per-category shapes; decimals travel as exact strings", () => {
    expect(previewEntrySchema.parse({ member_id: id, category: "deadlift", weight_kg: 72.5, reps: 5 })).toEqual({ member_id: id, category: "deadlift", weight_kg: "72.5", reps: 5 });
    expect(previewEntrySchema.parse({ member_id: id, category: "treadmill", km: "3.2" })).toEqual({ member_id: id, category: "treadmill", km: "3.2" });
    expect(previewEntrySchema.safeParse({ member_id: id, category: "pullups", reps: 5, km: "1" }).success).toBe(false);
    expect(previewEntrySchema.safeParse({ member_id: id, category: "deadlift", weight_kg: "1e3", reps: 5 }).success).toBe(false);
    expect(previewEntrySchema.safeParse({ member_id: id, category: "squat", weight_kg: "100", reps: 4.5 }).success).toBe(false);
    expect(previewEntrySchema.safeParse({ member_id: id, category: "plank", reps: 5 }).success).toBe(false);
    expect(previewEntrySchema.safeParse({ member_id: id, category: "pullups", reps: 5, photo_path: "x" }).success).toBe(false);
  });
  it("save accepts photo_path and performed_on only; never an acting user", () => {
    expect(createEntrySchema.safeParse({ member_id: id, category: "pullups", reps: 5, photo_path: "p", performed_on: "2026-11-01" }).success).toBe(true);
    expect(createEntrySchema.safeParse({ member_id: id, category: "pullups", reps: 5, logged_by: id }).success).toBe(false);
    expect(createEntrySchema.safeParse({ member_id: id, category: "pullups", reps: 5, performed_on: "yesterday" }).success).toBe(false);
  });
  it("void reason optional and bounded; evidence types limited", () => {
    expect(voidEntrySchema.parse({})).toEqual({});
    expect(voidEntrySchema.safeParse({ reason: "x".repeat(301) }).success).toBe(false);
    expect(evidenceUploadSchema.safeParse({ member_id: id, content_type: "image/png" }).success).toBe(false);
  });
});

describe("number input from any keyboard", () => {
  it("Arabic-Indic / Persian digits and the Arabic decimal mark become Western", () => {
    const arabic = String.fromCharCode(0x0667, 0x0662, 0x066b, 0x0665); // ٧٢٫٥
    const persian = String.fromCharCode(0x06f1, 0x06f0); // ۱۰
    expect(normalizeNumberInput(arabic)).toBe("72.5");
    expect(normalizeNumberInput(persian)).toBe("10");
    expect(normalizeNumberInput(" 3,5 ")).toBe("3.5");
  });
});

describe("fetchAll: never truncated by the API row limit", () => {
  it("reads every page until a short page", async () => {
    const total = PAGE_SIZE * 2 + 37;
    const rows = Array.from({ length: total }, (_, i) => i);
    const calls: Array<[number, number]> = [];
    const all = await fetchAll<number>(async (from, to) => {
      calls.push([from, to]);
      return { data: rows.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null }; // the API caps every response
    });
    expect(all).toHaveLength(total);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("an exact multiple ends on an empty page; errors throw", async () => {
    const rows = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    expect(await fetchAll<number>(async (from, to) => ({ data: rows.slice(from, to + 1), error: null }))).toHaveLength(PAGE_SIZE);
    await expect(fetchAll(async () => ({ data: null, error: { message: "boom" } }))).rejects.toThrow("boom");
    expect(await fetchAll(async () => ({ data: null, error: null }))).toEqual([]);
  });
  it("chunk splits id lists", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
