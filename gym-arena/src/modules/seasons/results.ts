/**
 * Frozen results (DATABASE_SCHEMA season_results, BR-S7, D29). Pure: turns the scoring
 * module's standings into the rows the close operation writes — one per participant:
 * - main board (active, non-rookie): `rank`;
 * - rookies (active): `rookie_rank`;
 * - members inactive at close: scored with the same formulas, but no rank at all (D29).
 * Values keep 4 decimals (numeric(8,4)); ranks are exactly those of scoreSeason (shared ranks).
 */
import { SCORE_CATEGORIES, TEST_CATEGORIES, type MemberScore, type Rational, type SeasonStandings, type TestCategory } from "@/modules/scoring";

export interface FrozenResultInput {
  member_id: string;
  is_rookie: boolean;
  deadlift: string;
  bench: string;
  squat: string;
  pullups: string;
  pushups: string;
  treadmill: string;
  consistency: string;
  improvement_points: string;
  total: string;
  rank: number | null;
  rookie_rank: number | null;
  baseline_json: Partial<Record<TestCategory, string | null>>;
  month_best_json: Partial<Record<TestCategory, string | null>>;
}

const fixed = (r: Rational) => r.toFixed(4);

function values(map: MemberScore["baseline"]): Partial<Record<TestCategory, string | null>> {
  const out: Partial<Record<TestCategory, string | null>> = {};
  for (const c of TEST_CATEGORIES) out[c] = map[c] ? fixed(map[c]!) : null;
  return out;
}

function row(score: MemberScore, rank: number | null, rookieRank: number | null): FrozenResultInput {
  const categories = Object.fromEntries(SCORE_CATEGORIES.map((c) => [c, fixed(score.categories[c])])) as Record<(typeof SCORE_CATEGORIES)[number], string>;
  return {
    member_id: score.memberId,
    is_rookie: score.isRookie,
    ...categories,
    improvement_points: fixed(score.improvementPoints),
    total: fixed(score.total),
    rank,
    rookie_rank: rookieRank,
    baseline_json: values(score.baseline),
    month_best_json: values(score.monthBest),
  };
}

export function frozenResultRows(standings: SeasonStandings): FrozenResultInput[] {
  return [
    ...standings.main.map((r) => row(r, r.rank, null)),
    ...standings.rookies.map((r) => row(r, null, r.rank)),
    ...standings.unranked.map((s) => row(s, null, null)),
  ];
}
