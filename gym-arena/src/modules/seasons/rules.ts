/**
 * Season edit rules (pure) — BR-S1, BR-S6, BR-S7, API_SPECIFICATION "PATCH /api/seasons/:id".
 * The database enforces the same rules (and overlap); checking here first gives the admin a
 * precise message before anything is written.
 */
import type { IsoDate } from "@/lib/time";
import { seasonStatus, type SeasonDates } from "./status";

export type SeasonRuleViolation =
  | { code: "SEASON_CLOSED"; reason: "closed" }
  | { code: "FORBIDDEN"; reason: "started" }
  | { code: "VALIDATION"; reason: "end_before_start" | "extend_only" };

export interface SeasonPatch {
  name?: string;
  starts_on?: IsoDate;
  ends_on?: IsoDate;
}

export function checkSeasonUpdate(season: SeasonDates, patch: SeasonPatch, today: IsoDate): SeasonRuleViolation | null {
  const status = seasonStatus(season, today);
  // BR-S7: closed seasons are immutable
  if (status === "closed") return { code: "SEASON_CLOSED", reason: "closed" };
  const startsOn = patch.starts_on ?? season.starts_on;
  const endsOn = patch.ends_on ?? season.ends_on;
  // API: starts_on can change only while the season is scheduled
  if (patch.starts_on !== undefined && patch.starts_on !== season.starts_on && status !== "scheduled") {
    return { code: "FORBIDDEN", reason: "started" };
  }
  if (endsOn < startsOn) return { code: "VALIDATION", reason: "end_before_start" };
  // BR-S6: once a season has started, its end date can only be extended
  if (status !== "scheduled" && endsOn < season.ends_on) return { code: "VALIDATION", reason: "extend_only" };
  return null;
}
