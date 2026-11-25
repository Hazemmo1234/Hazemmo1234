import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, ChevronIcon, TrophyIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatDateRange } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { closedSeasons } from "@/modules/seasons/lifecycle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("results");
  return { title: t("historyTitle") };
}

// UX C7 History — past championships; each opens its final top 3 and the coach's own clients'
// final ranks (frozen results — D30). Closed preseasons have no results (D20) and are not listed.
export default async function HistoryPage() {
  const [t, locale, seasons] = await Promise.all([getTranslations("results"), getLocale(), closedSeasons(await createClient())]);
  const championships = seasons.filter((s) => s.type === "championship");
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 lg:max-w-4xl">
      <h1 className="mb-4 text-2xl font-extrabold">{t("historyTitle")}</h1>
      {championships.length === 0 ? (
        <EmptyState icon={<CalendarIcon />} title={t("historyEmptyTitle")} description={t("historyEmptyBody")} />
      ) : (
        <ul className="space-y-3">
          {championships.map((s) => (
            <li key={s.id}>
              <Link href={`/history/${s.id}`} className="flex min-h-16 items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-3 hover:bg-surface-2">
                <TrophyIcon size={22} className="text-gold" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold"><bdi>{s.name}</bdi></p>
                  <p className="text-sm text-text-muted">{formatDateRange(s.starts_on, s.ends_on, locale as Locale)}</p>
                </div>
                <ChevronIcon size={18} className="text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
