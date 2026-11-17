import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { LoadError } from "@/components/coach/load-error";
import { TodayScreen } from "@/components/coach/today-screen";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { todayOverview, type TodayOverview } from "@/modules/entries/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.nav");
  return { title: t("today") };
}

export const dynamic = "force-dynamic";

// UX C2 Today. Data comes from the coach's own session: RLS shows only their clients (BR-X1).
export default async function TodayPage() {
  const [profile, t] = await Promise.all([getCurrentProfile(), getTranslations("coach")]);
  let data: TodayOverview | null = null;
  try {
    data = await todayOverview(await createClient(), profile!.id, today());
  } catch {
    data = null;
  }
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle={t("role")} />
      {data ? <TodayScreen data={data} /> : <LoadError />}
    </>
  );
}
