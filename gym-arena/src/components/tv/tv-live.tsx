"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import { PAGE_SECONDS, ROWS_PER_PAGE, isFreshPr, pageAt, pageCount, pageRows, splitBoard } from "@/modules/tv/paging";
import type { TvBoardRow, TvRookieRow, TvState } from "@/modules/tv/payload";
import { CountUp, Movement, Ticker, TvAvatar, type TvT } from "./tv-parts";

const ROW_H = 66;
const PLACE_COLOR: Record<number, { text: string; ring: string; bg: string }> = {
  1: { text: "text-gold", ring: "ring-gold", bg: "from-gold/25" },
  2: { text: "text-silver", ring: "ring-silver", bg: "from-silver/20" },
  3: { text: "text-bronze", ring: "ring-bronze", bg: "from-bronze/20" },
};

function PrBadge({ t }: { t: TvT }) {
  return <span className="rounded-lg bg-brand px-3 py-0.5 text-[24px] font-extrabold text-white">{t("pr")}</span>;
}

/**
 * Podium sizes on the 1920×1080 stage (UX C). The podium column is 824 px tall (the stage minus
 * the top bar, the ticker and the page padding). The #1 card (≈ 450 px), the gap (20 px) and the
 * #2/#3 row (≈ 330 px) must fit in it with room to spare. The cards clip their overflow (for the
 * shimmer and the PR glow), so content that did not fit used to vanish without a trace: the #1
 * card needed ≈ 573 px and was squeezed to 392 px, its name to 0 px. So every line height here
 * is explicit and no part of a card may shrink (e2e/tv.spec.ts checks the result). UX C minimums
 * at 1080p (readable at 5 m): names ≥ 40 px, points ≥ 56 px.
 */
const PODIUM = {
  big: { pad: "py-6", rank: 64, move: 30, avatar: 160, name: "text-[50px]", total: 96, pts: "text-[30px]" },
  small: { pad: "py-5", rank: 48, move: 24, avatar: 112, name: "text-[40px]", total: 64, pts: "text-[26px]" },
} as const;

/** One podium card. Rank 1 gets the gold shimmer every 10 s (UX "Motion"). */
function PodiumCard({ row, big, locale, t, serverNow }: { row: TvBoardRow; big: boolean; locale: Locale; t: TvT; serverNow: number }) {
  const color = PLACE_COLOR[row.rank] ?? PLACE_COLOR[3]!;
  const pr = isFreshPr(row.pr_at, serverNow);
  const s = PODIUM[big ? "big" : "small"];
  return (
    <div
      key={`${row.ref}-${pr ? row.pr_at : ""}`}
      data-testid="podium-card"
      className={`relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-3xl border border-border bg-gradient-to-b ${color.bg} to-surface px-6 ${s.pad} ${
        big ? "shrink-0" : ""
      } ${pr ? "tv-glow" : ""} ${row.rank === 1 ? "tv-shimmer" : ""}`}
    >
      <div className="flex shrink-0 items-center gap-3">
        <span className={`display tabular leading-none ${color.text}`} style={{ fontSize: s.rank }}>{formatNumber(row.rank, locale, 0)}</span>
        <Movement value={row.movement} locale={locale} size={s.move} />
        {pr && <PrBadge t={t} />}
      </div>
      <TvAvatar photoUrl={row.photo_url} initials={row.initials} size={s.avatar} ring={color.ring} />
      <p data-testid="podium-name" className={`mt-3 w-full shrink-0 truncate text-center font-extrabold leading-tight ${s.name}`}><bdi>{row.name}</bdi></p>
      <p data-testid="podium-total" className={`display mt-1 shrink-0 leading-none ${color.text}`} style={{ fontSize: s.total }}>
        <CountUp value={row.total} locale={locale} />
        <span className={`ms-3 not-italic text-text-muted ${s.pts}`}>{t("pts")}</span>
      </p>
    </div>
  );
}

function BoardRow({ row, index, locale, t, serverNow }: { row: TvBoardRow; index: number; locale: Locale; t: TvT; serverNow: number }) {
  const pr = isFreshPr(row.pr_at, serverNow);
  return (
    <li
      className="absolute inset-x-0 flex items-center gap-5 rounded-2xl px-5 transition-transform duration-[600ms] ease-out"
      style={{ height: ROW_H - 6, transform: `translateY(${index * ROW_H}px)` }}
    >
      <div key={pr ? row.pr_at : "x"} className={`absolute inset-0 rounded-2xl ${index % 2 ? "bg-surface/60" : "bg-surface"} ${pr ? "tv-glow" : ""}`} />
      <span className="display tabular relative w-[72px] text-center text-[44px] text-text">{formatNumber(row.rank, locale, 0)}</span>
      <span className="relative"><Movement value={row.movement} locale={locale} size={26} /></span>
      <span className="relative"><TvAvatar photoUrl={row.photo_url} initials={row.initials} size={50} /></span>
      <p className="relative min-w-0 flex-1 truncate text-[40px] font-bold leading-none"><bdi>{row.name}</bdi></p>
      {pr && <span className="relative"><PrBadge t={t} /></span>}
      {row.gap_to_next > 0 && (
        <span dir="ltr" className="relative w-[96px] text-end text-[24px] font-semibold text-text-muted tabular">{`-${formatNumber(row.gap_to_next, locale, 0)}`}</span>
      )}
      <span className="display relative w-[160px] text-end text-[56px] leading-none">
        <CountUp value={row.total} locale={locale} />
      </span>
    </li>
  );
}

function RookiesStrip({ rookies, locale, t }: { rookies: TvRookieRow[]; locale: Locale; t: TvT }) {
  if (rookies.length === 0) return null;
  return (
    <section className="mt-4 rounded-2xl border border-border bg-surface px-5 py-3">
      <p className="mb-2 text-[24px] font-extrabold uppercase text-brand-text">{t("rookiesTitle")}</p>
      <ul className="grid grid-cols-5 gap-3">
        {rookies.map((r) => (
          <li key={r.ref} className="flex min-w-0 items-center gap-3">
            <span className="display tabular text-[30px] text-text-muted">{formatNumber(r.rank, locale, 0)}</span>
            <TvAvatar photoUrl={r.photo_url} initials={r.initials} size={44} />
            <div className="min-w-0">
              <p className="truncate text-[24px] font-bold leading-tight"><bdi>{r.name}</bdi></p>
              <p className="display tabular text-[28px] leading-tight">{formatNumber(r.total, locale, 0)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Live mode (UX C): podium left 40 %, ranks 4+ right 60 % (10 per page, every 12 s), rookies strip, ticker. */
export function TvLive({ state, locale, t, serverNow }: { state: TvState; locale: Locale; t: TvT; serverNow: number }) {
  const { podium, rest } = splitBoard(state.board);
  const [tick, setTick] = useState(0);
  const pages = pageCount(rest.length);
  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setTick((x) => x + 1), PAGE_SECONDS * 1000);
    return () => clearInterval(id);
  }, [pages]);
  const page = pageAt(tick, rest.length);
  const rows = pageRows(rest, page);

  const ticker = state.recent_bests.map((b) => (
    <>
      <span className="me-3 font-extrabold text-brand-text">{t("newBest")}</span>
      <bdi className="font-bold">{b.name}</bdi>
      <span className="ms-3 text-text-muted" dir="ltr">{b.text}</span>
    </>
  ));

  return (
    <>
      <main className="flex min-h-0 flex-1 gap-8 px-10 py-6">
        {state.board.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="display text-[96px] uppercase">{t("emptyBoardTitle")}</p>
            <p className="mt-4 text-[40px] text-text-muted">{t("emptyBoardBody")}</p>
            <div className="mt-10 w-[1100px]"><RookiesStrip rookies={state.rookies} locale={locale} t={t} /></div>
          </div>
        ) : (
          <>
            <section className="flex w-[40%] min-w-0 flex-col gap-5" aria-label={t("podium")}>
              {podium[0] && <PodiumCard row={podium[0]} big locale={locale} t={t} serverNow={serverNow} />}
              <div className="grid min-h-0 flex-1 grid-cols-2 gap-5">
                {podium.slice(1).map((r) => (
                  <PodiumCard key={r.ref} row={r} big={false} locale={locale} t={t} serverNow={serverNow} />
                ))}
              </div>
            </section>
            <section className="flex w-[60%] min-w-0 flex-col" aria-label={t("standings")}>
              <div className="mb-3 flex h-[44px] items-center justify-between">
                <p className="text-[28px] font-extrabold uppercase text-text-muted">{t("standings")}</p>
                {pages > 1 && <p className="text-[24px] font-semibold text-text-muted tabular">{t("page", { page: formatNumber(page + 1, locale, 0), pages: formatNumber(pages, locale, 0) })}</p>}
              </div>
              {rest.length === 0 ? (
                <p className="flex flex-1 items-center justify-center text-[34px] text-text-muted">{t("onlyPodium")}</p>
              ) : (
                <ol key={page} className="tv-page-in relative" style={{ height: ROWS_PER_PAGE * ROW_H }}>
                  {rows.map((r, i) => (
                    <BoardRow key={r.ref} row={r} index={i} locale={locale} t={t} serverNow={serverNow} />
                  ))}
                </ol>
              )}
              <div className="mt-auto"><RookiesStrip rookies={state.rookies} locale={locale} t={t} /></div>
            </section>
          </>
        )}
      </main>
      <Ticker items={ticker} idle={t("tickerIdle")} label={t("live")} />
    </>
  );
}
