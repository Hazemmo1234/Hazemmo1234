"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LockIcon, TrophyIcon } from "@/components/ui/icons";
import { MemberAvatar } from "@/components/coach/shared";
import type { Locale } from "@/i18n/config";
import { formatDateRange, formatNumber } from "@/lib/i18n/format";
import type { LeaderboardRow } from "@/modules/leaderboard/board";
import type { SeasonResults } from "@/modules/seasons/lifecycle";
import { NameText } from "@/components/name-text";

const PLACE: Record<number, string> = { 1: "text-gold", 2: "text-silver", 3: "text-bronze" };
const RING: Record<number, string> = { 1: "border-gold/60", 2: "border-silver/50", 3: "border-bronze/50" };

function Row({ r, locale, highlightOwn }: { r: LeaderboardRow; locale: Locale; highlightOwn: boolean }) {
  const t = useTranslations("results");
  return (
    <li className={`flex items-center gap-3 px-5 py-3 ${highlightOwn && r.own ? "bg-brand/10" : ""}`}>
      <span className={`w-8 text-center text-lg font-extrabold tabular ${PLACE[r.rank] ?? "text-text-muted"}`}>{formatNumber(r.rank, locale, 0)}</span>
      <MemberAvatar name={r.full_name} url={r.photo_url} size="size-10" />
      <div className="min-w-0 flex-1">
        <NameText as="p" className="font-bold">{r.full_name}</NameText>
        {r.coach_name && <NameText as="p" className="text-xs text-text-muted">{r.coach_name}</NameText>}
      </div>
      {highlightOwn && r.own && <Badge tone="brand">{t("yourClient")}</Badge>}
      <span className="text-lg font-extrabold tabular">{formatNumber(r.total_display, locale, 0)}</span>
    </li>
  );
}

/**
 * The FROZEN results of a closed championship (D30, BR-W2): winners (ranks 1–3, ties shared —
 * D10), the final main board, the rookies list and — for the admin, or a coach's own clients —
 * members inactive at close, who keep their points but have no rank (D29).
 */
export function ResultsView({ results, highlightOwn = false }: { results: SeasonResults; highlightOwn?: boolean }) {
  const t = useTranslations("results");
  const locale = useLocale() as Locale;
  const { board, unranked } = results;
  const winners = board.main.filter((r) => r.rank <= 3);
  return (
    <div className="space-y-6">
      <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
        <LockIcon size={16} />
        {`${t("finalNote")} · ${formatDateRange(board.season.starts_on, board.season.ends_on, locale)}`}
      </p>
      {winners.length === 0 ? (
        <Card><EmptyState icon={<TrophyIcon />} title={t("noWinnersTitle")} description={t("noWinnersBody")} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {winners.map((w, i) => (
            <Card key={`${w.rank}-${i}`} className={`flex flex-col items-center gap-2 border-2 px-4 py-6 text-center ${RING[w.rank] ?? ""}`}>
              <TrophyIcon size={28} className={PLACE[w.rank]} />
              <p className={`text-sm font-extrabold uppercase ${PLACE[w.rank]}`}>{t("place", { place: formatNumber(w.rank, locale, 0) })}</p>
              <MemberAvatar name={w.full_name} url={w.photo_url} size="size-20" text="text-xl" />
              <NameText as="p" className="max-w-full text-lg font-extrabold">{w.full_name}</NameText>
              <p className="text-2xl font-extrabold tabular">{formatNumber(w.total_display, locale, 0)} <span className="text-sm font-semibold text-text-muted">{t("pts")}</span></p>
            </Card>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title={t("mainBoard")} action={<span className="text-sm text-text-muted">{formatNumber(board.main.length, locale, 0)}</span>} />
          {board.main.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-muted">{t("emptyList")}</p>
          ) : (
            <ol className="divide-y divide-border">{board.main.map((r, i) => <Row key={i} r={r} locale={locale} highlightOwn={highlightOwn} />)}</ol>
          )}
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title={t("rookies")} action={<span className="text-sm text-text-muted">{formatNumber(board.rookies.length, locale, 0)}</span>} />
            {board.rookies.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-muted">{t("emptyList")}</p>
            ) : (
              <ol className="divide-y divide-border">{board.rookies.map((r, i) => <Row key={i} r={r} locale={locale} highlightOwn={highlightOwn} />)}</ol>
            )}
          </Card>
          {unranked.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title={t("unranked")} />
              <p className="px-5 pt-3 text-xs text-text-muted">{t("unrankedHint")}</p>
              <ul className="divide-y divide-border">
                {unranked.map((u, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-8 text-center text-text-muted">{"–"}</span>
                    <NameText as="p" className="min-w-0 flex-1 font-semibold">{u.full_name}</NameText>
                    <Badge>{t("inactiveAtClose")}</Badge>
                    <span className="font-bold tabular text-text-muted">{formatNumber(u.total, locale, 0)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
