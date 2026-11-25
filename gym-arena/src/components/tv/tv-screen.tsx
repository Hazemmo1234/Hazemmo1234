"use client";

import { createTranslator } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { directionOf, type Locale } from "@/i18n/config";
import type { TvState } from "@/modules/tv/payload";
import { TvLive } from "./tv-live";
import { TvBetween, TvPreseason, TvReveal } from "./tv-modes";
import { ConnectionDot, TvClock, TvNotAuthorized, TvTopBar, type TvT } from "./tv-parts";

/** D4: the TV polls every 10 s. */
export const POLL_MS = 10_000;
const BASE_W = 1920;
const BASE_H = 1080;

export type TvMessages = Record<Locale, Record<string, string>>;

/** 1920×1080 stage, scaled to fit any screen without scrolling (UX C: "scaled to fit"). */
function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / BASE_W, window.innerHeight / BASE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

/** The scaled 1920×1080 stage in the TV language's direction. */
export function TvStage({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const scale = useStageScale();
  return (
    <div className="fixed inset-0 overflow-hidden bg-bg" dir={directionOf(locale)} lang={locale}>
      <div
        className="absolute flex flex-col bg-bg text-text"
        style={{
          width: BASE_W,
          height: BASE_H,
          left: "50%",
          top: "50%",
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The gym TV (UX section C). Server-rendered with a first state, then polls the TV state API.
 * - only re-renders content when `version` changes (animations run on real changes only);
 * - keeps the last state on network loss and shows a small "reconnecting" dot (AC-29);
 * - follows the TV language of the Admin's setting on the next poll, switching text and
 *   direction (AC-36) — never the language of whoever uses the device (BR-L4);
 * - a rotated key turns the screen to "Display not authorized" on the next poll.
 * All times shown or compared (PR window, reveal step) use the SERVER clock via an offset.
 */
export function TvScreen({ tvKey, initial, messages }: { tvKey: string; initial: TvState | null; messages: TvMessages }) {
  const [state, setState] = useState<TvState | null>(initial);
  const [offline, setOffline] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const offset = useRef(initial ? Date.parse(initial.server_time) - Date.now() : 0);
  const version = useRef(initial?.version ?? null);
  const [serverNow, setServerNow] = useState(() => Date.now() + offset.current);
  const locale: Locale = state?.locale ?? "ar";

  const t: TvT = useMemo(() => {
    const tr = createTranslator({ locale, messages: { tv: messages[locale] }, namespace: "tv" }) as unknown as TvT;
    return (key, values) => {
      try {
        return tr(key, values);
      } catch {
        return key;
      }
    };
  }, [locale, messages]);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/tv/state?key=${encodeURIComponent(tvKey)}`, { cache: "no-store" });
      if (res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as TvState;
      offset.current = Date.parse(next.server_time) - Date.now();
      setUnauthorized(false);
      setOffline(false);
      if (next.version !== version.current) {
        version.current = next.version;
        setState(next);
      }
    } catch {
      setOffline(true); // keep the last state on screen
    }
  }, [tvKey]);

  useEffect(() => {
    if (!initial) void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    const onOnline = () => void poll();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(id);
      window.removeEventListener("online", onOnline);
    };
  }, [poll, initial]);

  // 1-second clock for the PR window, the reveal sequence and day counters
  useEffect(() => {
    const id = setInterval(() => setServerNow(Date.now() + offset.current), 1000);
    return () => clearInterval(id);
  }, []);

  // TV language and direction come from the TV state (BR-L4)
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  let body: React.ReactNode;
  if (unauthorized) {
    body = <TvNotAuthorized title={t("notAuthorized")} hint={t("notAuthorizedHint")} />;
  } else if (!state) {
    body = (
      <main className="flex flex-1 flex-col items-center justify-center gap-8">
        <span aria-hidden="true" className="size-20 animate-spin rounded-full border-8 border-brand border-t-transparent" />
        <p className="text-[44px] text-text-muted">{offline ? t("unavailable") : t("connecting")}</p>
      </main>
    );
  } else {
    const days = state.season && state.mode === "live" ? t("daysLeft", { count: state.season.days_left, n: String(state.season.days_left) }) : null;
    body = (
      <>
        <TvTopBar
          gymName={state.gym_name}
          title={state.season ? <bdi>{state.season.name}</bdi> : t(state.mode === "between" ? "offSeasonTitle" : "connecting")}
          status={<ConnectionDot offline={offline} label={t("reconnecting")} />}
          right={
            <span className="flex items-center gap-8">
              {state.mode === "live" && (
                <span className="flex items-center gap-3 text-[28px] uppercase">
                  <span className="size-3.5 animate-pulse rounded-full bg-white" aria-hidden="true" />
                  {t("live")}
                </span>
              )}
              {days && <span>{days}</span>}
              <TvClock locale={locale} />
            </span>
          }
        />
        {state.mode === "live" && <TvLive state={state} locale={locale} t={t} serverNow={serverNow} />}
        {state.mode === "preseason" && <TvPreseason state={state} locale={locale} t={t} />}
        {state.mode === "between" && <TvBetween state={state} locale={locale} t={t} />}
        {state.mode === "reveal" && <TvReveal state={state} locale={locale} t={t} serverNow={serverNow} />}
      </>
    );
  }

  return <TvStage locale={locale}>{body}</TvStage>;
}
