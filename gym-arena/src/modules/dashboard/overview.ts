import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  const [seasonsRes, membersRes, entriesRes, coachesRes] = await Promise.all([
    supabase.from("seasons").select("id, name, type, starts_on, ends_on, closed_at").order("starts_on"),
    supabase.from("members").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("entries").select("logged_by").eq("performed_on", today).is("voided_at", null),
    supabase.from("profiles").select("id").eq("role", "coach").eq("is_active", true),
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
  const loggers = new Set((entriesRes.data ?? []).map((e) => e.logged_by as string));
  return {
    today,
    current: active ? { ...active, status: "active", daysLeft: seasonDaysLeft(active, today), participants } : null,
    next: next ? { ...next, daysUntil: seasonDaysLeft(next, today) } : null,
    awaitingClose,
    nextMonthCovered: isNextMonthCovered(seasons, today),
    activeMembers: membersRes.count ?? 0,
    entriesToday: entriesRes.data?.length ?? 0,
    activeCoaches: coachIds.size,
    coachesLoggedToday: [...loggers].filter((id) => coachIds.has(id)).length,
  };
}
