"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AlertIcon, CalendarIcon, CheckIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/categories";
import { formatDate } from "@/lib/i18n/format";
import { initials } from "@/lib/initials";
import type { CardSeason, MemberCard } from "@/modules/entries/card";

export type ApiError = { code?: string; reason?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** JSON call to our own API. Never throws: network failures come back as an error. */
export async function api<T>(url: string, body?: object): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: (json as { error?: ApiError } | null)?.error ?? {} };
  } catch {
    return { ok: false, error: { code: "NETWORK" } };
  }
}

/** Translates an API error: a known reason first, then the error code, then a generic message. */
export function useApiErrorText() {
  const t = useTranslations("coach.errors");
  const te = useTranslations("errors");
  return (e: ApiError) => {
    if (e.reason && t.has(e.reason.replace(":", "_") as never)) return t(e.reason.replace(":", "_") as never);
    if (e.code === "NETWORK") return t("network");
    if (e.code && te.has(e.code as never)) return te(e.code as never);
    return te("UNKNOWN");
  };
}

export function MemberAvatar({ name, url, size = "size-12", text = "text-sm" }: { name: string; url: string | null; size?: string; text?: string }) {
  return (
    <span className={`${size} ${text} grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-bold text-text-muted`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

/** UX C2: seven dots — six categories plus attendance — filled when done today. */
export function ActivityDots({ card }: { card: MemberCard }) {
  const t = useTranslations("coach.today");
  const done = CATEGORY_ORDER.map((code) => card.categories.find((c) => c.code === code)?.logged_today ?? false);
  done.push(card.attended_today);
  const count = done.filter(Boolean).length;
  return (
    <span className="flex items-center gap-1" role="img" aria-label={t("dotsLabel", { count })}>
      {done.map((on, i) => (
        <span
          key={i}
          title={i < CATEGORY_ORDER.length ? CATEGORY_LABEL[CATEGORY_ORDER[i]] : undefined}
          className={`size-2 rounded-full ${on ? (i === 6 ? "bg-up" : "bg-brand") : "bg-border"}`}
        />
      ))}
    </span>
  );
}

/** What the seven dots mean: one per test (in card order) and attendance last. */
export function DotsLegend() {
  const t = useTranslations("coach.today");
  const item = (cls: string, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`size-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
  return (
    <p data-testid="dots-legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-text-muted">
      {item("bg-brand", t("legendLogged"))}
      {item("bg-up", t("legendAttended"))}
      {item("bg-border", t("legendPending"))}
    </p>
  );
}

/** UX C2 header line: season + days left / preseason / between seasons / ended. */
export function SeasonBanner({ current, next, closed }: { current: CardSeason | null; next: CardSeason | null; closed: CardSeason | null }) {
  const t = useTranslations("coach.season");
  const locale = useLocale() as Locale;
  if (current) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <CalendarIcon size={20} className="shrink-0 text-brand-text" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold"><bdi>{current.name}</bdi></p>
          <p className="text-sm text-text-muted">
            {current.type === "preseason" ? t("preseason") : t("daysLeft", { count: current.days_left })}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm">
      <AlertIcon size={20} className="shrink-0 text-gold" />
      <p className="min-w-0 flex-1">
        <span className="font-bold">{closed ? t("ended") : t("none")}</span>
        {" · "}
        {next ? t("nextStarts", { date: formatDate(next.starts_on, locale) }) : t("noneScheduled")}
      </p>
    </div>
  );
}

/** Success toast with an optional action (UX C4: "+72 pts · Total 726 [Undo]"). */
export function ActionToast({ toast, onDone }: { toast: { message: string; action?: { label: string; run: () => void } } | null; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setBusy(false);
    const timer = setTimeout(onDone, toast.action ? 7000 : 4000);
    return () => clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 md:bottom-8">
      {toast && (
        <div role="status" className="toast-in pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-up/30 bg-surface py-2 pe-2 ps-4 text-sm font-semibold shadow-2xl">
          <CheckIcon size={18} className="shrink-0 text-up" />
          <span className="min-w-0 py-2">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                toast.action!.run();
              }}
              className="min-h-11 shrink-0 rounded-xl px-4 font-bold text-brand-text hover:bg-surface-2 disabled:opacity-50"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
