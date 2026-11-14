/**
 * Derived season status — BR-S3, DATABASE_SCHEMA "seasons". Pure: `today` is the Cairo
 * date supplied by the caller (lib/time.ts). Status is never stored; it follows the dates.
 */
import { addDays, daysBetween, monthBounds, type IsoDate } from "@/lib/time";

export type SeasonType = "preseason" | "championship";
export type SeasonStatus = "scheduled" | "active" | "ended" | "closed";

export interface SeasonDates {
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
  closed_at: string | null;
}

/** closed if closed_at; active if today ∈ [starts_on, ends_on]; scheduled before; ended (awaiting close) after. */
export function seasonStatus(season: SeasonDates, today: IsoDate): SeasonStatus {
  if (season.closed_at) return "closed";
  if (today < season.starts_on) return "scheduled";
  if (today > season.ends_on) return "ended";
  return "active";
}

/** Days left including today while active; days until start while scheduled; otherwise 0. */
export function seasonDaysLeft(season: SeasonDates, today: IsoDate): number {
  const status = seasonStatus(season, today);
  if (status === "active") return daysBetween(today, season.ends_on) + 1;
  if (status === "scheduled") return daysBetween(today, season.starts_on);
  return 0;
}

/** The season covering `today` that is still open (BR-S4: logging allowed only then). */
export function activeSeason<T extends SeasonDates>(seasons: readonly T[], today: IsoDate): T | null {
  return seasons.find((s) => seasonStatus(s, today) === "active") ?? null;
}

/** The earliest season that has not started yet. */
export function nextScheduledSeason<T extends SeasonDates>(seasons: readonly T[], today: IsoDate): T | null {
  return [...seasons].filter((s) => seasonStatus(s, today) === "scheduled").sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))[0] ?? null;
}

/** UX A1 alert: is the first day of next calendar month covered by any season? */
export function isNextMonthCovered(seasons: readonly SeasonDates[], today: IsoDate): boolean {
  const nextMonthStart = addDays(monthBounds(today).endsOn, 1);
  return seasons.some((s) => s.starts_on <= nextMonthStart && nextMonthStart <= s.ends_on);
}

/** BR-S1 default for a new season: the next calendar month after `today`. */
export function suggestNextMonth(today: IsoDate): { startsOn: IsoDate; endsOn: IsoDate } {
  return monthBounds(addDays(monthBounds(today).endsOn, 1));
}
