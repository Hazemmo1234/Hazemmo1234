import { getTranslations } from "next-intl/server";
import { TvScreen, type TvMessages } from "@/components/tv/tv-screen";
import { today } from "@/lib/time";
import { tvKeyMatches } from "@/modules/tv/key";
import { getTvSettings } from "@/modules/tv/settings";
import { buildTvState } from "@/modules/tv/state";
import type { TvState } from "@/modules/tv/payload";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

export const dynamic = "force-dynamic";

// UX section C — the gym TV (`/tv?key=…`). The key is checked in constant time on every
// request (D3); the first state is rendered on the server so the screen is never blank, then
// the client polls GET /api/tv/state every 10 s (D4). Language: the Admin's TV setting (BR-L4).
export default async function TvPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  const settings = await getTvSettings();
  const t = await getTranslations({ locale: settings.locale, namespace: "tv" });
  if (!settings.tvKey || !key || !tvKeyMatches(key, settings.tvKey)) {
    return <main className="flex min-h-dvh items-center justify-center text-2xl text-text-muted">{t("notAuthorized")}</main>;
  }
  let initial: TvState | null = null;
  try {
    initial = await buildTvState({ ...settings, tvKey: settings.tvKey }, today());
  } catch {
    initial = null; // the client shows "connecting" and keeps retrying
  }
  // only the TV strings of both languages reach the browser (the language can change on a poll)
  const messages: TvMessages = { ar: ar.tv, en: en.tv };
  return <TvScreen tvKey={key} initial={initial} messages={messages} />;
}
