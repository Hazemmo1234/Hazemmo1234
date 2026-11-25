"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { CoachIcon } from "@/components/ui/icons";
import { formatNumber, formatTime } from "@/lib/i18n/format";
import type { TvTag } from "@/modules/tv/payload";
import { NameText } from "../name-text";

/** Translator handed down from the TV screen (TV language, not the viewer's — BR-L4). */
export type TvT = (key: string, values?: Record<string, string | number>) => string;

/** Photo (consented, signed URL) or initials avatar (BR-P8, AC-28). */
export function TvAvatar({ photoUrl, initials, size, ring }: { photoUrl: string | null; initials: string; size: number; ring?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  const ringCls = ring ? `ring-4 ${ring}` : "";
  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs; no image optimizer
      <img src={photoUrl} alt="" style={style} onError={() => setFailed(true)} className={`shrink-0 rounded-full bg-surface-2 object-cover ${ringCls}`} />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className={`grid shrink-0 place-items-center rounded-full bg-surface-2 font-extrabold text-text-muted ${ringCls}`}
    >
      {initials}
    </span>
  );
}

/** Animated count-up to `value` (UX C row anatomy): eases from the previous value in 900 ms. */
export function CountUp({ value, locale, className = "" }: { value: number; locale: Locale; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      from.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 900);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + (value - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return <span className={`tabular ${className}`}>{formatNumber(shown, locale, 0)}</span>;
}

/** ▲2 green / ▼1 red / – (UX C). Arrows never mirror (UX "Language & direction"). */
export function Movement({ value, locale, size = 28 }: { value: number | null; locale: Locale; size?: number }) {
  if (value === null || value === 0) {
    return <span className="inline-block w-[2.2em] text-center text-text-muted" style={{ fontSize: size }} aria-hidden="true">{"–"}</span>;
  }
  const up = value > 0;
  return (
    <span dir="ltr" className={`inline-flex w-[2.2em] items-center justify-center gap-0.5 font-extrabold tabular ${up ? "text-up" : "text-down"}`} style={{ fontSize: size }}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      {formatNumber(Math.abs(value), locale, 0)}
    </span>
  );
}

/** Live Cairo clock for the top bar. */
export function TvClock({ locale }: { locale: Locale }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular">{now ? formatTime(now, locale) : "--:--"}</span>;
}

/** TV top bar: logo tile, gym name, season name, right-side status (UX "Logo placement"). */
export function TvTopBar({ gymName, title, right, status }: { gymName: string | null; title: ReactNode; right?: ReactNode; status?: ReactNode }) {
  return (
    <header className="flex h-[112px] items-center gap-6 bg-brand px-12 text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand tile */}
      <img src="/brand/logo-tile.png" alt="" width={72} height={72} className="size-[72px] rounded-2xl" />
      <div className="min-w-0 flex-1">
        {gymName && <p className="truncate text-[26px] font-semibold leading-tight opacity-90"><bdi>{gymName}</bdi></p>}
        <p className="truncate text-[40px] font-extrabold leading-tight">{title}</p>
      </div>
      {status}
      {right && <div className="text-end text-[34px] font-extrabold leading-tight">{right}</div>}
    </header>
  );
}

/**
 * Bottom ticker (UX C): items scroll continuously; the speed is constant whatever the number
 * of items (≈ 120 px/s at 1080p). With nothing to say, a fixed message stays put.
 */
export function Ticker({ items, idle, label }: { items: ReactNode[]; idle: string; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(30);
  useEffect(() => {
    const w = track.current?.scrollWidth ?? 0;
    setDuration(Math.max(20, w / 2 / 120));
  }, [items.length]);
  return (
    <footer className="flex h-[96px] items-center overflow-hidden border-t-4 border-brand bg-surface">
      <span className="z-10 flex h-full shrink-0 items-center bg-brand px-8 text-[30px] font-extrabold uppercase text-white">{label}</span>
      {items.length === 0 ? (
        <p className="truncate px-8 text-[30px] font-semibold text-text-muted">{idle}</p>
      ) : (
        <div className="relative h-full min-w-0 flex-1 overflow-hidden" dir="ltr">
          <div ref={track} className="tv-ticker absolute inset-y-0 flex w-max items-center" style={{ animationDuration: `${duration}s` }}>
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center" aria-hidden={copy === 1 || undefined}>
                {items.map((item, i) => (
                  <span key={i} className="flex items-center whitespace-nowrap px-10 text-[30px] font-semibold">
                    {item}
                    <span aria-hidden="true" className="ms-10 inline-block size-2.5 rounded-full bg-brand-text" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
}

/** Small "reconnecting" indicator (UX C: keep the last state, never a blank screen). */
export function ConnectionDot({ offline, label }: { offline: boolean; label: string }) {
  if (!offline) return null;
  return (
    <span role="status" className="flex items-center gap-3 rounded-full bg-black/30 px-5 py-2 text-[24px] font-semibold">
      <span className="size-3.5 animate-pulse rounded-full bg-gold" />
      {label}
    </span>
  );
}

/**
 * A TV opened without a valid key (UX C "Invalid key"): the brand, "Display not authorized" and
 * one line on how to fix it, in the TV language. Shows nothing about the gym's data.
 */
export function TvNotAuthorized({ title, hint }: { title: string; hint: string }) {
  return (
    <main data-testid="tv-not-authorized" className="flex flex-1 flex-col items-center justify-center gap-8 px-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element -- static brand tile, same file as the top bar */}
      <img src="/brand/logo-tile.png" alt="" width={160} height={160} className="rounded-3xl opacity-90" />
      <p className="display text-[72px] uppercase leading-none">{title}</p>
      <p className="max-w-[1200px] text-[36px] leading-snug text-text-muted">{hint}</p>
    </main>
  );
}

/**
 * D34: the second identifier shown after a name that another member shares — the coach (icon +
 * coach name, any script, cut at its end) or the short member number ("#127", left to right).
 */
export function TvTagLabel({ tag, size, className = "" }: { tag: TvTag; size: number; className?: string }) {
  return (
    <span data-testid="name-tag" data-kind={tag.kind} className={`inline-flex min-w-0 max-w-full items-center gap-[0.3em] font-semibold not-italic text-text-muted ${className}`} style={{ fontSize: size }}>
      {tag.kind === "coach" ? (
        <>
          <CoachIcon size={Math.round(size * 0.95)} />
          <NameText className="leading-tight">{tag.text}</NameText>
        </>
      ) : (
        <bdi dir="ltr" className="tabular leading-tight">{tag.text}</bdi>
      )}
    </span>
  );
}
