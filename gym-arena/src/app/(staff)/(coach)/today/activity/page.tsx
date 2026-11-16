import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { ActivityScreen } from "@/components/coach/activity-screen";
import { LoadError } from "@/components/coach/load-error";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDays, today } from "@/lib/time";
import { activityLog, type ActivityRow } from "@/modules/entries/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.nav");
  return { title: t("activity") };
}

export const dynamic = "force-dynamic";

// Entries log: the coach's own clients only (RLS). ?days=1|7 — the period is in the URL.
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = sp.days === "7" ? 7 : 1;
  const [profile, t] = await Promise.all([getCurrentProfile(), getTranslations("coach")]);
  const day = today();
  let rows: ActivityRow[] | null = null;
  try {
    rows = await activityLog(await createClient(), profile!.id, { from: addDays(day, -(days - 1)), to: day }, day);
  } catch {
    rows = null;
  }
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle={t("role")} />
      {rows ? <ActivityScreen rows={rows} days={days} today={day} /> : <LoadError />}
    </>
  );
}
