"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, TrophyIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import type { Leaderboard, LeaderboardRow } from "@/modules/leaderboard/board";
import { MemberAvatar } from "./shared";
import { NameText } from "../name-text";

type Tab = "main" | "rookies";

/**
 * UX C6: the global ranking as a list — Main / Rookies tabs (BR-R2: rookies never on the main
 * board), the coach's own clients highlighted and openable. Ranks are shared on ties (1, 1, 3);
 * points are the half-up integers the TV shows (SCORING §5).
 */
export function LeaderboardScreen({ board }: { board: Leaderboard | null }) {
  const t = useTranslations("coach.leaderboard");
  const [tab, setTab] = useState<Tab>("main");
  const id = useId();

  if (!board) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <EmptyState icon={<CalendarIcon />} title={t("noSeasonTitle")} description={t("noSeasonBody")} />
      </main>
    );
  }
  if (board.season.type === "preseason") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <EmptyState icon={<CalendarIcon />} title={t("preseasonTitle")} description={t("preseasonBody")} />
      </main>
    );
  }

  const rows = tab === "main" ? board.main : board.rookies;
  const tabs: Array<{ value: Tab; count: number }> = [
    { value: "main", count: board.main.length },
    { value: "rookies", count: board.rookies.length },
  ];
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      {/* D30: a closed season shows its frozen results — say so */}
      {board.final && <Badge tone="warning" className="text-sm">{t("final")}</Badge>}
      <div role="tablist" aria-label={t("tabs")} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {tabs.map(({ value, count }) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`${id}-${value}`}
            aria-selected={tab === value}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(value)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors ${tab === value ? "bg-brand text-white" : "text-text-muted hover:text-text"}`}
          >
            {t(value)}
            <span className={`tabular text-xs ${tab === value ? "text-white/80" : ""}`}>{count}</span>
          </button>
        ))}
      </div>

      <section role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="space-y-3">
        {tab === "rookies" && <p className="text-sm text-text-muted">{t("rookiesNote")}</p>}
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface">
            <EmptyState icon={<TrophyIcon />} title={t("emptyTitle")} description={t("emptyBody")} />
          </div>
        ) : (
          <ol aria-label={t(tab)} className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {rows.map((row, i) => <BoardRow key={`${row.rank}-${i}`} row={row} />)}
          </ol>
        )}
      </section>
    </main>
  );
}

function BoardRow({ row }: { row: LeaderboardRow }) {
  const t = useTranslations("coach.leaderboard");
  const locale = useLocale() as Locale;
  const podium = row.rank <= 3 && !row.is_rookie;
  const body = (
    <>
      <span
        aria-label={t("rank", { rank: row.rank })}
        className={`display tabular w-10 shrink-0 text-center text-xl leading-none ${podium ? "text-gold" : "text-text-muted"}`}
      >
        {formatNumber(row.rank, locale, 0)}
      </span>
      <MemberAvatar name={row.full_name} url={row.photo_url} size="size-10" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <NameText className="font-bold">{row.full_name}</NameText>
          {row.own && <Badge tone="brand">{t("yourClient")}</Badge>}
        </span>
        {row.coach_name && <NameText className="block text-xs text-text-muted">{row.coach_name}</NameText>}
      </span>
      <span className="shrink-0 text-end">
        <span className="display tabular block text-xl leading-none">{formatNumber(row.total_display, locale, 0)}</span>
        <span className="text-xs text-text-muted">{t("points")}</span>
      </span>
    </>
  );
  const base = "flex min-h-16 items-center gap-3 px-4 py-2 [contain-intrinsic-size:auto_4rem] [content-visibility:auto]";
  // only the coach's own clients carry an id (and can be opened); everyone else is read-only
  return (
    <li data-own={row.own || undefined} className={row.own ? "bg-brand/10" : undefined}>
      {row.own && row.member_id ? (
        <Link href={`/members/${row.member_id}`} className={`${base} transition-colors hover:bg-brand/15`}>{body}</Link>
      ) : (
        <div className={base}>{body}</div>
      )}
    </li>
  );
}
