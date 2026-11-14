import { getTranslations } from "next-intl/server";
import { tvKeyMatches } from "@/modules/tv/key";
import { getTvSettings } from "@/modules/tv/settings";

export const dynamic = "force-dynamic";

// M0: key gate + TV language only. Live / preseason / between / reveal modes are M5.
export default async function TvPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const settings = await getTvSettings();
  const [t, c] = await Promise.all([
    getTranslations({ locale: settings.locale, namespace: "tv" }),
    getTranslations({ locale: settings.locale, namespace: "common" }),
  ]);
  if (!settings.tvKey || !tvKeyMatches(key, settings.tvKey)) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-2xl text-text-muted">{t("notAuthorized")}</main>
    );
  }
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <p className="display text-6xl uppercase">{c("appName")}</p>
      {settings.gymName && <p className="text-2xl text-text-muted">{settings.gymName}</p>}
    </main>
  );
}
