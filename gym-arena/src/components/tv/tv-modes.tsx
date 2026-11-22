"use client";

import { CATEGORY_LABEL } from "@/lib/categories";
import type { Locale } from "@/i18n/config";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { revealStepAt, revealTimeline, type RevealStepKind } from "@/modules/tv/reveal";
import type { TvState, TvWinner } from "@/modules/tv/payload";
import { Ticker, TvAvatar, type TvT } from "./tv-parts";

function BigCountdown({ title, days, date, locale, t }: { title: string; days: number; date: string | null; locale: Locale; t: TvT }) {
  return (
    <div className="text-center">
      <p className="text-[44px] font-bold uppercase text-text-muted">{title}</p>
      <p className="display mt-2 text-[220px] leading-none text-white">
        {t("countdownDays", { count: days, n: formatNumber(days, locale, 0) })}
      </p>
      {date && <p className="mt-4 text-[40px] font-semibold text-brand-text">{formatDate(date, locale)}</p>}
    </div>
  );
}

/** Preseason (UX C): countdown to the championship, baselines progress, ticker of who logged. */
export function TvPreseason({ state, locale, t }: { state: TvState; locale: Locale; t: TvT }) {
  const p = state.preseason ?? { baselines_logged: 0, participants: 0, recent: [] };
  const pct = p.participants > 0 ? Math.round((p.baselines_logged / p.participants) * 100) : 0;
  const counting = state.next_season_in_days !== null;
  const ticker = p.recent.map((r) => (
    <>
      <bdi className="font-bold">{r.name}</bdi>
      <span className="ms-3 text-text-muted">{t("baselineLogged")}</span>
      <span className="ms-3 text-brand-text" dir="ltr">{CATEGORY_LABEL[r.category]}</span>
    </>
  ));
  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-16 px-16">
        <div className="text-center">
          <p className="display text-[120px] uppercase leading-none text-brand-text">{t("preseasonTitle")}</p>
          <p className="mt-4 text-[40px] text-text-muted">{t("preseasonSubtitle")}</p>
        </div>
        <BigCountdown
          title={counting ? t("countdownTitle") : t("preseasonEnds")}
          days={counting ? state.next_season_in_days! : state.season?.days_left ?? 0}
          date={counting ? state.next_season_starts_on : null}
          locale={locale}
          t={t}
        />
        <div className="w-[1200px]">
          <div className="mb-4 flex items-end justify-between text-[40px] font-bold">
            <span>{t("baselinesLogged")}</span>
            <span dir="ltr" className="display tabular text-[64px]">
              {`${formatNumber(p.baselines_logged, locale, 0)} / ${formatNumber(p.participants, locale, 0)}`}
            </span>
          </div>
          <div className="h-8 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={p.participants} aria-valuenow={p.baselines_logged}>
            <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </main>
      <Ticker items={ticker} idle={t("tickerIdle")} label={t("preseasonTitle")} />
    </>
  );
}

/** Between seasons (UX C): "Results coming soon" or a countdown to the next championship. */
export function TvBetween({ state, locale, t }: { state: TvState; locale: Locale; t: TvT }) {
  const awaiting = state.between?.reason === "awaiting_close" || state.between?.reason === "awaiting_reveal";
  return (
    <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-16 px-16 text-center">
      {awaiting ? (
        <div>
          {state.season && <p className="text-[48px] font-bold text-text-muted"><bdi>{state.season.name}</bdi></p>}
          <p className="display mt-4 text-[150px] uppercase leading-none text-brand-text">{t("resultsSoonTitle")}</p>
          <p className="mt-8 text-[44px] text-text-muted">{t("resultsSoonBody")}</p>
        </div>
      ) : (
        <p className="display text-[120px] uppercase leading-none">{t("offSeasonTitle")}</p>
      )}
      {state.next_season_in_days !== null ? (
        <BigCountdown title={t("nextStartsIn")} days={state.next_season_in_days} date={state.next_season_starts_on} locale={locale} t={t} />
      ) : (
        !awaiting && <p className="text-[44px] text-text-muted">{t("noneScheduled")}</p>
      )}
    </main>
  );
}

const PLACE_TEXT: Record<number, string> = { 1: "text-gold", 2: "text-silver", 3: "text-bronze" };
const PLACE_RING: Record<number, string> = { 1: "ring-gold", 2: "ring-silver", 3: "ring-bronze" };

function WinnerGroup({ winners, place, locale, t, size }: { winners: TvWinner[]; place: number; locale: Locale; t: TvT; size: "hero" | "podium" }) {
  const hero = size === "hero";
  return (
    <div className="flex flex-wrap items-end justify-center gap-16">
      {winners.filter((w) => w.place === place).map((w) => (
        <div key={w.ref} className={`flex flex-col items-center ${hero ? "tv-rise" : ""}`}>
          <TvAvatar photoUrl={w.photo_url} initials={w.initials} size={hero ? 320 : place === 1 ? 220 : 170} ring={PLACE_RING[place]} />
          <p className={`mt-8 max-w-[900px] truncate font-extrabold ${hero ? "text-[88px]" : "text-[48px]"}`}><bdi>{w.name}</bdi></p>
          <p className={`display leading-none ${PLACE_TEXT[place]} ${hero ? "text-[140px]" : "text-[80px]"}`}>
            {formatNumber(w.total, locale, 0)}
            <span className="ms-4 text-[36px] not-italic text-text-muted">{t("pts")}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

const STEP_LABEL: Partial<Record<RevealStepKind, string>> = { third: "revealThird", second: "revealSecond", champion: "revealChampion" };
const STEP_PLACE: Partial<Record<RevealStepKind, number>> = { third: 3, second: 2, champion: 1 };

/**
 * Reveal (UX C, BR-S8): driven by the time since `reveal.started_at` (server clock), so a
 * refreshed TV resumes at the right step (AC-24). Winners are the FROZEN results (D30).
 */
export function TvReveal({ state, locale, t, serverNow }: { state: TvState; locale: Locale; t: TvT; serverNow: number }) {
  const reveal = state.reveal;
  const winners = reveal?.winners ?? [];
  const steps = revealTimeline(new Set(winners.map((w) => w.place)));
  const elapsed = reveal ? (serverNow - Date.parse(reveal.started_at)) / 1000 : Number.POSITIVE_INFINITY;
  const { step } = revealStepAt(steps, elapsed);
  const seasonName = state.season?.name ?? "";

  if (winners.length === 0) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="display text-[96px] uppercase"><bdi>{seasonName}</bdi></p>
        <p className="mt-6 text-[44px] text-text-muted">{t("revealNoWinners")}</p>
      </main>
    );
  }

  return (
    <main key={step.kind} className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-16 text-center">
      {step.kind === "intro" && (
        <>
          <div className="tv-curtain pointer-events-none absolute inset-0 bg-brand" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand tile */}
          <img src="/brand/logo-tile.png" alt="" width={240} height={240} className="tv-rise mb-12 size-[240px] rounded-[48px]" />
          <p className="tv-rise text-[64px] font-bold uppercase text-text-muted">{t("revealIntro")}</p>
          <p className="display tv-rise mt-2 text-[150px] uppercase leading-none"><bdi>{seasonName}</bdi></p>
        </>
      )}
      {(step.kind === "third" || step.kind === "second" || step.kind === "champion") && (
        <>
          {step.kind === "champion" && <div className="tv-burst pointer-events-none absolute inset-0" aria-hidden="true" />}
          <p className={`display tv-rise mb-10 text-[110px] uppercase leading-none ${PLACE_TEXT[STEP_PLACE[step.kind]!]}`}>{t(STEP_LABEL[step.kind]!)}</p>
          <WinnerGroup winners={winners} place={STEP_PLACE[step.kind]!} locale={locale} t={t} size="hero" />
        </>
      )}
      {step.kind === "drumroll" && <p className="display tv-drumroll text-[180px] uppercase leading-none text-gold">{t("revealDrumroll")}</p>}
      {step.kind === "final" && (
        <>
          <p className="text-[48px] font-bold text-text-muted"><bdi>{seasonName}</bdi></p>
          <p className="display mb-12 text-[96px] uppercase leading-none text-gold">{t("revealFinal")}</p>
          <div className="flex items-end justify-center gap-20">
            {[2, 1, 3].filter((p) => winners.some((w) => w.place === p)).map((p) => (
              <div key={p} className={`flex flex-col items-center ${p === 1 ? "tv-shimmer -translate-y-10" : ""}`}>
                <p className={`display mb-4 text-[72px] ${PLACE_TEXT[p]}`}>{t("place", { place: formatNumber(p, locale, 0) })}</p>
                <WinnerGroup winners={winners} place={p} locale={locale} t={t} size="podium" />
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
