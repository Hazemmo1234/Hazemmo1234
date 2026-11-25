import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ResultsView } from "@/components/seasons/results-view";
import { ButtonLink } from "@/components/ui/button";
import { ChevronIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { seasonResults } from "@/modules/seasons/lifecycle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("results");
  return { title: t("title") };
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UX A2 "View frozen results" — the final standings of a closed championship (D30, BR-W2).
export default async function SeasonResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!GUID.test(id)) notFound();
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const t = await getTranslations("results");
  const result = await seasonResults(await createClient(), { id: profile.id, role: profile.role }, id, today());
  if (!result.ok) notFound();
  return (
    <>
      <PageHeader
        title={<bdi>{result.data.board.season.name}</bdi>}
        description={t("title")}
        actions={
          <ButtonLink variant="secondary" href="/admin/seasons">
            <ChevronIcon size={18} className="-scale-x-100 rtl:scale-x-100" />
            {t("backToSeasons")}
          </ButtonLink>
        }
      />
      <ResultsView results={result.data} />
    </>
  );
}
