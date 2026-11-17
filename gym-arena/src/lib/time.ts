/**
 * Single source of "today" for all business rules (CLAUDE.md non-negotiable).
 * Every day boundary is a calendar date in Africa/Cairo (Egypt observes DST).
 * Never use the client clock for business rules — call these on the server.
 */
export const APP_TIMEZONE = "Africa/Cairo";

/** ISO calendar date, e.g. "2026-11-14". */
export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const cairoDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Cairo calendar date of an instant (defaults to now). */
export function cairoDate(instant: Date = new Date()): IsoDate {
  return cairoDateFormatter.format(instant);
}

/** Today in Cairo — BR-E3: `performed_on` is always the server's Cairo date. */
export function today(now: Date = new Date()): IsoDate {
  return cairoDate(now);
}

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtcMidnight(date: IsoDate): number {
  if (!isIsoDate(date)) throw new Error(`Invalid ISO date: ${date}`);
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** Pure calendar arithmetic (no timezone involved). */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b − a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / 86_400_000);
}

/** Inclusive range check on ISO dates. */
export function isWithin(date: IsoDate, startsOn: IsoDate, endsOn: IsoDate): boolean {
  return date >= startsOn && date <= endsOn;
}

/** Days left in a season including today (0 once it has ended). */
export function daysLeft(endsOn: IsoDate, now: Date = new Date()): number {
  return Math.max(0, daysBetween(today(now), endsOn) + 1);
}

/** First and last day of the calendar month containing `date` (BR-S1 default). */
export function monthBounds(date: IsoDate): { startsOn: IsoDate; endsOn: IsoDate } {
  const startsOn = `${date.slice(0, 7)}-01`;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { startsOn, endsOn: `${date.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}
