import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { SeasonsManager } from "@/components/seasons/seasons-manager";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { listSeasons } from "@/modules/seasons/service";
import { suggestNextMonth } from "@/modules/seasons/status";
import type { Locale } from "@/i18n/config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seasons");
  return { title: t("title") };
}

// UX A2 Seasons — list, create (suggests next calendar month), edit / extend.
// Close (ended seasons, with a confirmation summary), Start reveal and results (closed championships).
export default async function SeasonsPage() {
  const day = today();
  const [locale, seasons] = await Promise.all([getLocale(), listSeasons(await createClient(), day)]);
  return <SeasonsManager seasons={seasons} today={day} suggestion={suggestNextMonth(day)} locale={locale as Locale} />;
}
