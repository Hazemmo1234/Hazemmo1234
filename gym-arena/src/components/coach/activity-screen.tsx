"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClasses } from "@/components/ui/field";
import { ActivityIcon, CameraIcon, SearchIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { CATEGORY_LABEL } from "@/lib/categories";
import { formatDate, formatTime } from "@/lib/i18n/format";
import type { ActivityRow } from "@/modules/entries/service";
import { ActionToast, api, useApiErrorText } from "./shared";
import { NameText } from "../name-text";

/** Entries log — recent results for the coach's own clients, with same-day Undo (BR-E9). */
export function ActivityScreen({ rows, days, today }: { rows: ActivityRow[]; days: 1 | 7; today: string }) {
  const t = useTranslations("coach.activity");
  const tc = useTranslations("coach.card");
  const te = useTranslations("coach.entry");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const errorText = useApiErrorText();
  const [query, setQuery] = useState("");
  const [showUndone, setShowUndone] = useState(false);
  const [undoing, setUndoing] = useState<ActivityRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (showUndone || !r.voided) && (!q || r.member_name.toLowerCase().includes(q) || r.member_code.toLowerCase().includes(q)));
  }, [rows, query, showUndone]);
  const groups = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const r of visible) map.set(r.performed_on, [...(map.get(r.performed_on) ?? []), r]);
    return [...map.entries()];
  }, [visible]);
  const undoneCount = rows.filter((r) => r.voided).length;

  async function confirmUndo() {
    if (!undoing) return;
    setBusy(true);
    const res = await api(`/api/entries/${undoing.id}/void`, {});
    setBusy(false);
    if (!res.ok) {
      setUndoing(null);
      return setError(errorText(res.error));
    }
    setUndoing(null);
    setError(null);
    setToast({ message: tc("undone") });
    router.refresh();
  }

  const line = (r: ActivityRow) =>
    r.weight_kg !== null ? te("liftLine", { weight: Number(r.weight_kg), reps: r.reps ?? 0, value: r.value }) : r.km !== null ? te("valueKm", { value: r.value }) : te("valueReps", { value: r.value });

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-6 lg:max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold">{t("title")}</h1>
        <p className="text-sm text-text-muted">{t("description")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="relative block">
          <span className="sr-only">{t("search")}</span>
          <SearchIcon className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className={`${inputClasses} ps-11`} />
        </label>
        <div role="radiogroup" aria-label={t("period")} className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface-2 p-1">
          {([1, 7] as const).map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              onClick={() => router.replace(d === 1 ? pathname : `${pathname}?days=7`)}
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold ${days === d ? "bg-brand text-white" : "text-text-muted hover:text-text"}`}
            >
              {d === 1 ? t("today") : t("week")}
            </button>
          ))}
        </div>
      </div>
      {undoneCount > 0 && (
        <button type="button" aria-pressed={showUndone} onClick={() => setShowUndone(!showUndone)} className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${showUndone ? "border-brand/40 bg-brand/10 text-brand-text" : "border-border bg-surface-2 text-text-muted"}`}>
          {t("showUndone", { count: undoneCount })}
        </button>
      )}
      {error && <p role="alert" className="rounded-2xl border border-down/30 bg-down/10 px-4 py-3 text-sm font-semibold text-down">{error}</p>}

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState icon={<ActivityIcon />} title={rows.length === 0 ? t("emptyTitle") : t("noResults")} description={rows.length === 0 ? t("emptyBody") : undefined} />
        </div>
      ) : (
        groups.map(([date, list]) => (
          <section key={date} className="overflow-hidden rounded-2xl border border-border bg-surface">
            <h2 className="border-b border-border px-4 py-3 text-sm font-bold">{date === today ? t("today") : formatDate(date, locale)}</h2>
            <ul className="divide-y divide-border">
              {list.map((r) => (
                <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.voided ? "opacity-60" : ""}`}>
                  <Link href={`/members/${r.member_id}`} className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <NameText className="font-bold">{r.member_name}</NameText>
                      {r.voided && <Badge>{tc("undoneBadge")}</Badge>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
                      <span dir="ltr" className={r.voided ? "line-through" : ""}>{CATEGORY_LABEL[r.category]}</span>
                      <bdi>{line(r)}</bdi>
                      {r.has_photo && <CameraIcon size={14} aria-label={tc("hasPhoto")} />}
                      <span>{formatTime(new Date(r.created_at), locale)}</span>
                      {!r.logged_by_me && <span>{t("byOther")}</span>}
                    </span>
                  </Link>
                  {r.can_undo && <Button variant="ghost" onClick={() => setUndoing(r)}>{tc("undo")}</Button>}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {undoing && (
        <Dialog
          open
          onClose={() => setUndoing(null)}
          closeLabel={tc("close")}
          title={tc("undoTitle")}
          description={<><bdi>{undoing.member_name}</bdi>{" · "}<span dir="ltr">{CATEGORY_LABEL[undoing.category]}</span></>}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUndoing(null)}>{tc("keep")}</Button>
              <Button variant="danger" loading={busy} onClick={confirmUndo}>{tc("undoConfirm")}</Button>
            </>
          }
        >
          <p className="text-sm text-text-muted">{tc("undoBody")}</p>
        </Dialog>
      )}
      <ActionToast toast={toast} onDone={clearToast} />
    </main>
  );
}
