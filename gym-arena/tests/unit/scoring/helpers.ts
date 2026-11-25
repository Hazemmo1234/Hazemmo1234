import { Rational, type Decimal, type MemberSeasonValues, type TestCategory } from "@/modules/scoring";

export const r = (x: Decimal) => Rational.from(x);

/** Build formula inputs directly from B/M values, as the spec examples state them. */
export function values(partial: Partial<Omit<MemberSeasonValues, "baseline" | "monthBest" | "treadmillKmByDay">> & {
  baseline?: Partial<Record<TestCategory, Decimal>>;
  monthBest?: Partial<Record<TestCategory, Decimal>>;
  treadmill?: Decimal[];
} = {}): MemberSeasonValues {
  const map = (o: Partial<Record<TestCategory, Decimal>> = {}) =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Rational.from(v as Decimal)])) as Partial<Record<TestCategory, Rational>>;
  return {
    memberId: partial.memberId ?? "m",
    isActive: partial.isActive ?? true,
    isRookie: partial.isRookie ?? false,
    plannedSessions: partial.plannedSessions ?? 12,
    attendedDays: partial.attendedDays ?? 0,
    baseline: map(partial.baseline),
    monthBest: map(partial.monthBest),
    treadmillKmByDay: (partial.treadmill ?? []).map((k) => Rational.from(k)),
  };
}

/** ±0.0001 as required by AC-19 */
export const close4 = (actual: Rational, expected: number) =>
  Math.abs(actual.toNumber() - expected) < 0.0001;
