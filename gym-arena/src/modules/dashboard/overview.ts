import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { today as cairoToday, type IsoDate } from "@/lib/time";
import {
  activeSeason, isNextMonthCovered, nextScheduledSeason, seasonDaysLeft, seasonStatus,
  type SeasonDates, type SeasonStatus,
} from "@/modules/seasons/status";

export interface SeasonSummary extends SeasonDates {
  id: string;
  name: string;
}

/**
 * Admin dashboard data (UX A1) that does not depend on scoring. Ranking cards
 * (Top 5, new bests, % logged this week, entries per category) arrive with M4.
 * Reads run as the signed-in admin, so RLS applies.
 */
export interface AdminOverview {
  today: IsoDate;
  current: (SeasonSummary & { status: SeasonStatus; daysLeft: number; participants: number }) | null;
  next: (SeasonSummary & { daysUntil: number }) | null;
  /** most recent season that ended and still awaits Close (BR-S5) */
  awaitingClose: SeasonSummary | null;
  nextMonthCovered: boolean;
  activeMembers: number;
  entriesToday: number;
  activeCoaches: number;
  coachesLoggedToday: number;
}

export async function getAdminOverview(supabase: SupabaseClient, now: Date = new Date()): Promise<AdminOverview> {
  const today = cairoToday(now);
  const [seasonsRes, membersRes, entriesRes, coachesRes, todayLoggers] = await Promise.all([
    supabase.from("seasons").select("id, name, type, starts_on, ends_on, closed_at").order("starts_on"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    // exact counts / every page: a plain select is capped at max_rows (1000), which made a busy
    // day show "1000" results and could miss coaches who logged after the first 1000 rows
    supabase.from("entries").select("id", { count: "exact", head: true }).eq("performed_on", today).is("voided_at", null),
    supabase.from("profiles").select("id").eq("role", "coach").eq("is_active", true),
    fetchAll<{ logged_by: string }>((from, to) =>
      supabase.from("entries").select("logged_by").eq("performed_on", today).is("voided_at", null).order("id").range(from, to) as never),
  ]);
  for (const res of [seasonsRes, membersRes, entriesRes, coachesRes]) if (res.error) throw new Error(res.error.message);

  const seasons = (seasonsRes.data ?? []) as SeasonSummary[];
  const active = activeSeason(seasons, today);
  const next = nextScheduledSeason(seasons, today);
  const awaitingClose = [...seasons].reverse().find((s) => seasonStatus(s, today) === "ended") ?? null;

  let participants = 0;
  if (active) {
    const res = await supabase
      .from("season_participants")
      .select("member_id, members!inner(status)", { count: "exact", head: true })
      .eq("season_id", active.id)
      .eq("members.status", "active");
    if (res.error) throw new Error(res.error.message);
    participants = res.count ?? 0;
  }

  const coachIds = new Set((coachesRes.data ?? []).map((c) => c.id as string));
  const loggers = new Set(todayLoggers.map((e) => e.logged_by));
  return {
    today,
    current: active ? { ...active, status: "active", daysLeft: seasonDaysLeft(active, today), participants } : null,
    next: next ? { ...next, daysUntil: seasonDaysLeft(next, today) } : null,
    awaitingClose,
    nextMonthCovered: isNextMonthCovered(seasons, today),
    activeMembers: membersRes.count ?? 0,
    entriesToday: entriesRes.count ?? 0,
    activeCoaches: coachIds.size,
    coachesLoggedToday: [...loggers].filter((id) => coachIds.has(id)).length,
  };
}
