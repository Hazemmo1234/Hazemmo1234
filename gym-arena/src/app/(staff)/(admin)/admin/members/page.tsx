import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { MembersManager, type MemberFilters } from "@/components/members/members-manager";
import type { Locale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { listMembers } from "@/modules/members/service";
import { activeSeason } from "@/modules/seasons/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("title") };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UX A3 Members — filters live in the URL (?q=&coach=&status=&rookie=1) so a filtered view
// can be linked to (e.g. from the Coaches "deactivation blocked" dialog).
export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filters: MemberFilters = {
    q: (sp.q ?? "").slice(0, 60),
    coach: sp.coach && GUID.test(sp.coach) ? sp.coach : "",
    status: sp.status === "active" || sp.status === "inactive" ? sp.status : "all",
    rookie: sp.rookie === "1",
  };
  const day = today();
  const supabase = await createClient();
  const [locale, members, coaches, seasons] = await Promise.all([
    getLocale(),
    listMembers(supabase, { q: filters.q || undefined, coach_id: filters.coach || undefined, status: filters.status === "all" ? undefined : filters.status }, day),
    supabase.from("profiles").select("id, full_name, is_active").eq("role", "coach").order("full_name"),
    supabase.from("seasons").select("type, starts_on, ends_on, closed_at"),
  ]);
  const hasActiveSeason = !!activeSeason(seasons.data ?? [], day);
  const visible = filters.rookie && hasActiveSeason ? members.filter((m) => m.is_rookie) : members;
  return (
    <MembersManager
      members={visible}
      coaches={(coaches.data ?? []) as Array<{ id: string; full_name: string; is_active: boolean }>}
      filters={filters}
      hasActiveSeason={hasActiveSeason}
      locale={locale as Locale}
    />
  );
}
