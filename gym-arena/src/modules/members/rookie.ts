/**
 * Rookie flag for the member list (UX A3 filter). Uses the scoring module's own
 * definition — `memberSeasonValues(...).isRookie` (SCORING §1: no non-voided entry in any
 * category before the season start) — so the list and the leaderboards can never disagree.
 * Pure: the caller supplies the rows.
 */
import { memberSeasonValues, type ScoringEntry, type SeasonWindow } from "@/modules/scoring";

export interface EntryRowForRookie {
  member_id: string;
  category: ScoringEntry["category"];
  performed_on: string;
  weight_kg: number | string | null;
  reps: number | null;
  km: number | string | null;
  voided_at: string | null;
}

export function rookieFlags(
  season: SeasonWindow,
  memberIds: readonly string[],
  entries: readonly EntryRowForRookie[],
): Map<string, boolean> {
  const byMember = new Map<string, ScoringEntry[]>();
  for (const e of entries) {
    const list = byMember.get(e.member_id) ?? [];
    list.push({
      category: e.category,
      performedOn: e.performed_on,
      weightKg: e.weight_kg,
      reps: e.reps,
      km: e.km,
      voided: e.voided_at !== null,
    });
    byMember.set(e.member_id, list);
  }
  const flags = new Map<string, boolean>();
  for (const memberId of memberIds) {
    const values = memberSeasonValues(
      { memberId, isActive: true, plannedSessions: 12, entries: byMember.get(memberId) ?? [], attendance: [] },
      season,
    );
    flags.set(memberId, values.isRookie);
  }
  return flags;
}
