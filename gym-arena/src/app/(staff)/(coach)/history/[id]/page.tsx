import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultsView } from "@/components/seasons/results-view";
import { ChevronIcon } from "@/components/ui/icons";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { seasonResults } from "@/modules/seasons/lifecycle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("results");
  return { title: t("historyTitle") };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UX C7 — one past championship: final top 3, the final board with the coach's own clients
// highlighted (D31: other coaches' clients without photos), from the frozen results (D30).
export default async function HistorySeasonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!GUID.test(id)) notFound();
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const t = await getTranslations("results");
  const result = await seasonResults(await createClient(), { id: profile.id, role: profile.role }, id, today());
  if (!result.ok) notFound();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link href="/history" className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronIcon size={16} className="-scale-x-100 rtl:scale-x-100" />
        {t("historyTitle")}
      </Link>
      <h1 className="mb-4 text-2xl font-extrabold"><bdi>{result.data.board.season.name}</bdi></h1>
      <ResultsView results={result.data} highlightOwn />
    </main>
  );
}
