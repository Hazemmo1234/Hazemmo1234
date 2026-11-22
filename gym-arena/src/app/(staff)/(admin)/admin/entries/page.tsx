import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EntriesManager, type EntryFilters } from "@/components/entries/entries-manager";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { entriesQuerySchema } from "@/lib/validation/entries";
import { listEntries } from "@/modules/entries/admin";
import { listSeasons } from "@/modules/seasons/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("entries");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

// UX A5 Entries — filterable log (season, date, coach, member, category, voided) with
// corrections: edit values, change date (within the season), void, view photo. Every
// correction asks for a reason (BR-E9). Filters live in the URL so a view can be linked to.
export default async function EntriesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const day = today();
  const supabase = await createClient();
  const [seasons, coaches] = await Promise.all([
    listSeasons(supabase, day),
    supabase.from("profiles").select("id, full_name").eq("role", "coach").order("full_name"),
  ]);
  // default season: the one running today, else the most recent one that has started
  const fallback = seasons.find((s) => s.status === "active") ?? seasons.find((s) => s.status !== "scheduled") ?? seasons[0] ?? null;
  const parsed = entriesQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v !== undefined && v !== "")));
  const query = parsed.success ? parsed.data : {};
  const seasonId = query.season_id ?? fallback?.id;
  const filters: EntryFilters = {
    season_id: seasonId ?? "",
    coach_id: query.coach_id ?? "",
    category: query.category ?? "",
    date: query.date ?? "",
    q: query.q ?? "",
    include_voided: query.include_voided === "true",
    page: query.page ?? 1,
  };
  const page = seasonId ? await listEntries(supabase, { ...query, season_id: seasonId }) : { rows: [], page: 1, pages: 1, total: 0 };
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  return (
    <EntriesManager
      filters={filters}
      page={page}
      today={day}
      season={season ? { id: season.id, name: season.name, status: season.status, starts_on: season.starts_on, ends_on: season.ends_on } : null}
      seasons={seasons.map((s) => ({ id: s.id, name: s.name }))}
      coaches={(coaches.data ?? []) as Array<{ id: string; full_name: string }>}
    />
  );
}
