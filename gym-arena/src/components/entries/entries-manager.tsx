"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApiErrorText, type ApiError } from "@/components/coach/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField, inputClasses } from "@/components/ui/field";
import { AlertIcon, BanIcon, ChevronIcon, EntriesIcon, LockIcon, PencilIcon, PhotoIcon, SearchIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Toast, useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/config";
import { CATEGORY_LABEL, CATEGORY_ORDER, isLiftCategory } from "@/lib/categories";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import type { CategoryCode } from "@/lib/supabase/types";
import type { IsoDate } from "@/lib/time";
import type { AdminEntryRow, EntriesPage } from "@/modules/entries/admin";
import type { SeasonStatus } from "@/modules/seasons/status";

export interface EntryFilters {
  season_id: string;
  coach_id: string;
  category: CategoryCode | "";
  date: string;
  q: string;
  include_voided: boolean;
  page: number;
}

interface SeasonInfo {
  id: string;
  name: string;
  status: SeasonStatus;
  starts_on: IsoDate;
  ends_on: IsoDate;
}

async function send<T>(method: "PATCH" | "POST" | "GET", url: string, body?: object): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: (json as { error?: ApiError } | null)?.error ?? {} };
  } catch {
    return { ok: false, error: { code: "NETWORK" } };
  }
}

/** "100 kg × 5" · "12 reps" · "5.2 km" — the raw input of an entry. */
function useEntryText() {
  const t = useTranslations("entries");
  return (r: Pick<AdminEntryRow, "category" | "weight_kg" | "reps" | "km" | "value">) => {
    if (isLiftCategory(r.category)) return t("liftValue", { weight: String(Number(r.weight_kg ?? 0)), reps: String(r.reps ?? 0), e1rm: r.value });
    if (r.category === "treadmill") return t("kmValue", { km: r.value });
    return t("repsValue", { reps: r.value });
  };
}

function ReasonField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string | null }) {
  const t = useTranslations("entries");
  return (
    <div>
      <label htmlFor="correction-reason" className="mb-1.5 block text-start text-sm font-semibold">{t("reason")}</label>
      <textarea
        id="correction-reason"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={300}
        rows={3}
        required
        aria-invalid={error ? true : undefined}
        placeholder={t("reasonPlaceholder")}
        className={`${inputClasses} h-auto py-3`}
      />
      {error ? <p className="mt-1.5 text-sm font-semibold text-down">{error}</p> : <p className="mt-1.5 text-xs text-text-muted">{t("reasonHint")}</p>}
    </div>
  );
}

function EditDialog({ row, season, today, onClose, onSaved }: { row: AdminEntryRow; season: SeasonInfo; today: IsoDate; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("entries");
  const c = useTranslations("common");
  const errorText = useApiErrorText();
  const lift = isLiftCategory(row.category);
  const [weight, setWeight] = useState(row.weight_kg ? String(Number(row.weight_kg)) : "");
  const [reps, setReps] = useState(row.reps !== null ? String(row.reps) : "");
  const [km, setKm] = useState(row.km ? String(Number(row.km)) : "");
  const [date, setDate] = useState(row.performed_on);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const maxDate = season.ends_on < today ? season.ends_on : today;

  const patch: Record<string, string | number> = {};
  if (lift && weight !== String(Number(row.weight_kg ?? 0))) patch.weight_kg = weight;
  if (row.category !== "treadmill" && reps !== String(row.reps ?? "")) patch.reps = Number(reps);
  if (row.category === "treadmill" && km !== String(Number(row.km ?? 0))) patch.km = km;
  if (date !== row.performed_on) patch.performed_on = date;
  const changed = Object.keys(patch).length > 0;

  async function save() {
    if (!changed) return setError(t("nothingChanged"));
    if (!reason.trim()) return setError(t("reasonRequired"));
    setBusy(true);
    setError(null);
    const res = await send<AdminEntryRow>("PATCH", `/api/entries/${row.id}`, { ...patch, reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    onSaved();
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={t("editTitle")}
      description={t("editDescription", { name: row.member_name, category: CATEGORY_LABEL[row.category] })}
      closeLabel={c("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{c("cancel")}</Button>
          <Button onClick={() => void save()} loading={busy} disabled={!changed || !reason.trim()}>{t("saveCorrection")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {lift && (
          <>
            <Field label={t("weight")} inputMode="decimal" dir="ltr" value={weight} onChange={(e) => setWeight(e.target.value)} hint={t("weightHint")} />
            <SelectField label={t("reps")} value={reps} onChange={(e) => setReps(e.target.value)}>
              {[3, 4, 5].map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </SelectField>
          </>
        )}
        {(row.category === "pullups" || row.category === "pushups") && (
          <Field label={t("reps")} inputMode="numeric" dir="ltr" value={reps} onChange={(e) => setReps(e.target.value.replace(/\D/g, ""))} />
        )}
        {row.category === "treadmill" && <Field label={t("km")} inputMode="decimal" dir="ltr" value={km} onChange={(e) => setKm(e.target.value)} hint={t("kmHint")} />}
        <Field label={t("date")} type="date" dir="ltr" value={date} min={season.starts_on} max={maxDate} onChange={(e) => setDate(e.target.value)} hint={t("dateHint")} />
        <ReasonField value={reason} onChange={setReason} />
        {error && (
          <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-down"><AlertIcon size={18} />{error}</p>
        )}
      </div>
    </Dialog>
  );
}

function VoidDialog({ row, onClose, onSaved }: { row: AdminEntryRow; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("entries");
  const c = useTranslations("common");
  const errorText = useApiErrorText();
  const text = useEntryText();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    if (!reason.trim()) return setError(t("reasonRequired"));
    setBusy(true);
    setError(null);
    const res = await send<{ ok: true }>("POST", `/api/entries/${row.id}/void`, { reason: reason.trim() });
    setBusy(false);
    if (!res.ok) return setError(errorText(res.error));
    onSaved();
  }
  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={t("voidTitle")}
      description={t("voidDescription", { name: row.member_name, category: CATEGORY_LABEL[row.category], value: text(row) })}
      closeLabel={c("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{c("cancel")}</Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={!reason.trim()}>{t("voidConfirm")}</Button>
        </>
      }
    >
      <ul className="mb-4 list-disc space-y-1.5 ps-5 text-sm text-text-muted">
        <li>{t("voidEffectPoints")}</li>
        <li>{t("voidEffectKept")}</li>
      </ul>
      <ReasonField value={reason} onChange={setReason} error={error} />
    </Dialog>
  );
}

function PhotoDialog({ row, onClose }: { row: AdminEntryRow; onClose: () => void }) {
  const t = useTranslations("entries");
  const c = useTranslations("common");
  const errorText = useApiErrorText();
  const [state, setState] = useState<{ url?: string; error?: string } | null>(null);
  useEffect(() => {
    let live = true;
    void send<{ url: string }>("GET", `/api/entries/${row.id}/photo`).then((res) => {
      if (live) setState(res.ok ? { url: res.data.url } : { error: errorText(res.error) });
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per opened entry
  }, [row.id]);
  return (
    <Dialog open onClose={onClose} title={t("photoTitle")} description={`${row.member_name} · ${CATEGORY_LABEL[row.category]}`} closeLabel={c("close")}>
      {state?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
        <img src={state.url} alt={t("photoAlt")} className="max-h-[60dvh] w-full rounded-2xl object-contain" />
      ) : state?.error ? (
        <p role="alert" className="text-sm font-semibold text-down">{state.error}</p>
      ) : (
        <div className="h-64 animate-pulse rounded-2xl bg-surface-2" />
      )}
    </Dialog>
  );
}

type DialogState = { kind: "edit" | "void" | "photo"; row: AdminEntryRow } | null;

/** UX A5 — the admin's entries log with corrections (BR-E9, BR-E11). */
export function EntriesManager({
  filters,
  page,
  today,
  season,
  seasons,
  coaches,
}: {
  filters: EntryFilters;
  page: EntriesPage;
  today: IsoDate;
  season: SeasonInfo | null;
  seasons: Array<{ id: string; name: string }>;
  coaches: Array<{ id: string; full_name: string }>;
}) {
  const t = useTranslations("entries");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const text = useEntryText();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [q, setQ] = useState(filters.q);
  // optimistic: the box reflects the click at once; the server list follows the URL
  const [showVoided, setShowVoided] = useState(filters.include_voided);
  useEffect(() => setShowVoided(filters.include_voided), [filters.include_voided]);
  const editable = season !== null && season.status !== "closed";

  const go = (next: Partial<EntryFilters>) => {
    const merged = { ...filters, page: 1, ...next };
    const params = new URLSearchParams();
    if (merged.season_id) params.set("season_id", merged.season_id);
    if (merged.coach_id) params.set("coach_id", merged.coach_id);
    if (merged.category) params.set("category", merged.category);
    if (merged.date) params.set("date", merged.date);
    if (merged.q) params.set("q", merged.q);
    if (merged.include_voided) params.set("include_voided", "true");
    if (merged.page > 1) params.set("page", String(merged.page));
    router.push(`${pathname}?${params.toString()}`);
  };
  const done = (message: string) => {
    setDialog(null);
    toast.show(message);
    router.refresh();
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="mb-4 p-4">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: q.trim() });
          }}
        >
          <SelectField label={t("filterSeason")} value={filters.season_id} onChange={(e) => go({ season_id: e.target.value })}>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SelectField>
          <SelectField label={t("filterCoach")} value={filters.coach_id} onChange={(e) => go({ coach_id: e.target.value })}>
            <option value="">{t("allCoaches")}</option>
            {coaches.map((co) => <option key={co.id} value={co.id}>{co.full_name}</option>)}
          </SelectField>
          <SelectField label={t("filterCategory")} value={filters.category} onChange={(e) => go({ category: e.target.value as CategoryCode | "" })}>
            <option value="">{t("allCategories")}</option>
            {CATEGORY_ORDER.map((cat) => <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>)}
          </SelectField>
          <Field label={t("filterDate")} type="date" dir="ltr" value={filters.date} min={season?.starts_on} max={season?.ends_on} onChange={(e) => go({ date: e.target.value })} />
          <Field
            label={t("search")}
            placeholder={t("searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            trailing={
              <button type="submit" aria-label={t("search")} className="grid size-11 place-items-center rounded-lg text-text-muted hover:text-text">
                <SearchIcon size={18} />
              </button>
            }
          />
          <label className="flex min-h-11 items-center gap-3 self-end rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={showVoided}
              onChange={(e) => {
                setShowVoided(e.target.checked);
                go({ include_voided: e.target.checked });
              }}
              className="size-5 accent-brand"
            />
            {t("includeVoided")}
          </label>
        </form>
      </Card>

      {season?.status === "closed" && (
        <p className="mb-4 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">
          <LockIcon size={18} />
          {t("closedNote")}
        </p>
      )}

      {page.rows.length === 0 ? (
        <Card>
          <EmptyState icon={<EntriesIcon />} title={t("emptyTitle")} description={season ? t("emptyBody") : t("noSeasonBody")} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="border-b border-border px-5 py-3 text-sm text-text-muted">{t("count", { count: page.total, n: formatNumber(page.total, locale, 0) })}</p>
          <ul className="divide-y divide-border">
            {page.rows.map((r) => (
              <li key={r.id} className={`grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center ${r.voided_at ? "opacity-70" : ""}`}>
                <div className="min-w-0">
                  <p className="truncate font-bold"><bdi>{r.member_name}</bdi> <span className="text-xs font-normal text-text-muted" dir="ltr">{r.member_code}</span></p>
                  <p className="text-sm text-text-muted">{formatDate(r.performed_on, locale)}{r.coach_name && <>{" · "}<bdi>{r.coach_name}</bdi></>}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold" dir="ltr" style={{ textAlign: "start" }}>{CATEGORY_LABEL[r.category]}</p>
                  <p className="text-sm text-text-muted" dir="ltr" style={{ textAlign: "start" }}>{text(r)}</p>
                </div>
                <div className="min-w-0 text-sm">
                  <p className="text-text-muted">{t("loggedBy", { name: r.logged_by_name ?? "—" })}</p>
                  {r.voided_at ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone="danger">{t("voided")}</Badge>
                      <span className="text-text-muted">{r.void_reason ? <bdi>{r.void_reason}</bdi> : t("noReason")}</span>
                    </p>
                  ) : r.has_photo ? (
                    <p className="mt-1"><Badge tone="brand"><PhotoIcon size={14} />{t("hasPhoto")}</Badge></p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {r.has_photo && (
                    <Button variant="ghost" onClick={() => setDialog({ kind: "photo", row: r })} aria-label={t("viewPhotoNamed", { name: r.member_name })}>
                      <PhotoIcon size={18} />
                      <span className="lg:sr-only xl:not-sr-only">{t("viewPhoto")}</span>
                    </Button>
                  )}
                  {editable && !r.voided_at && (
                    <>
                      <Button variant="secondary" onClick={() => setDialog({ kind: "edit", row: r })} aria-label={t("editNamed", { name: r.member_name })}>
                        <PencilIcon size={18} />
                        {t("edit")}
                      </Button>
                      <Button variant="danger" onClick={() => setDialog({ kind: "void", row: r })} aria-label={t("voidNamed", { name: r.member_name })}>
                        <BanIcon size={18} />
                        {t("void")}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {page.pages > 1 && (
            <nav className="flex items-center justify-between border-t border-border px-5 py-3" aria-label={t("pagination")}>
              <Button variant="secondary" disabled={page.page <= 1} onClick={() => go({ page: page.page - 1 })}>
                <ChevronIcon size={18} className="-scale-x-100 rtl:scale-x-100" />
                {t("previous")}
              </Button>
              <span className="text-sm text-text-muted">{t("pageOf", { page: formatNumber(page.page, locale, 0), pages: formatNumber(page.pages, locale, 0) })}</span>
              <Button variant="secondary" disabled={page.page >= page.pages} onClick={() => go({ page: page.page + 1 })}>
                {t("next")}
                <ChevronIcon size={18} />
              </Button>
            </nav>
          )}
        </Card>
      )}

      {dialog?.kind === "edit" && season && <EditDialog row={dialog.row} season={season} today={today} onClose={() => setDialog(null)} onSaved={() => done(t("toastEdited"))} />}
      {dialog?.kind === "void" && <VoidDialog row={dialog.row} onClose={() => setDialog(null)} onSaved={() => done(t("toastVoided"))} />}
      {dialog?.kind === "photo" && <PhotoDialog row={dialog.row} onClose={() => setDialog(null)} />}
      <Toast message={toast.message} />
    </>
  );
}
