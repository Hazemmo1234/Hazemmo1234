"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { MemberFormDialog } from "@/components/members/member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { CameraIcon, CheckIcon, ChevronIcon, LockIcon, PencilIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { CATEGORY_LABEL } from "@/lib/categories";
import { formatTime } from "@/lib/i18n/format";
import { PLANNED_MAX, PLANNED_MIN } from "@/lib/validation/members";
import type { CardSeason, CategoryTile, MemberCard } from "@/modules/entries/card";
import type { MemberDetail } from "@/modules/members/service";
import { EntrySheet, type SavedEntry } from "./entry-sheet";
import { ActionToast, MemberAvatar, SeasonBanner, api, useApiErrorText } from "./shared";
import { NameText } from "../name-text";

type Toast = { message: string; action?: { label: string; run: () => void } } | null;

/** UX C3 member card — everything a coach needs for one client, one thumb away. */
export function MemberCardScreen({
  member,
  initialCard,
  next,
  closedSeason,
}: {
  member: MemberDetail;
  initialCard: MemberCard;
  next: CardSeason | null;
  closedSeason: CardSeason | null;
}) {
  const t = useTranslations("coach.card");
  const te = useTranslations("coach.entry");
  const tm = useTranslations("members");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const errorText = useApiErrorText();
  const [card, setCard] = useState(initialCard);
  const [sheet, setSheet] = useState<CategoryTile | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [undoing, setUndoing] = useState<MemberCard["today_entries"][number] | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [attending, setAttending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const season = card.season;
  const canLog = !!season && member.status === "active";
  const championship = season?.type === "championship";

  async function refreshCard() {
    const res = await api<{ card: MemberCard }>(`/api/members/${member.id}`);
    if (res.ok) setCard(res.data.card);
  }

  async function undo(entryId: string) {
    const res = await api<{ member_card: MemberCard }>(`/api/entries/${entryId}/void`, {});
    setUndoing(null);
    if (!res.ok) {
      setToast(null);
      setError(errorText(res.error));
      return;
    }
    setError(null);
    setCard(res.data.member_card);
    setToast({ message: t("undone") });
    router.refresh();
  }

  function saved(result: SavedEntry) {
    setSheet(null);
    setCard(result.member_card);
    setError(null);
    const delta = result.preview?.points_delta_display ?? 0;
    const message = !championship
      ? t("savedBaseline")
      : delta > 0
        ? t("savedPoints", { points: delta, total: result.member_card.total_display })
        : t("savedNoPoints", { total: result.member_card.total_display });
    setToast({ message, action: { label: t("undo"), run: () => void undo(result.entry.id) } });
    router.refresh();
  }

  async function attend() {
    setAttending(true);
    setError(null);
    const res = await api<{ member_card: MemberCard }>("/api/attendance", { member_id: member.id });
    setAttending(false);
    if (res.ok) {
      setCard(res.data.member_card);
      setToast({ message: t("attendedToast") });
      router.refresh();
    } else {
      setError(errorText(res.error));
      if (res.error.code === "ALREADY_LOGGED_TODAY") void refreshCard();
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <Link href="/today" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ChevronIcon size={16} className="-scale-x-100 rtl:scale-x-100" />
        {t("back")}
      </Link>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center gap-4">
          <MemberAvatar name={member.full_name} url={member.photo_url} size="size-20" text="text-2xl" />
          <div className="min-w-0 flex-1">
            <NameText as="h1" className="text-xl font-extrabold">{member.full_name}</NameText>
            <p className="text-sm text-text-muted" dir="ltr">{member.member_code}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {season && card.is_rookie && <Badge tone="warning">{tm("rookie")}</Badge>}
              {member.status !== "active" && <Badge>{tm("status.inactive")}</Badge>}
            </div>
          </div>
          {championship && (
            <div className="shrink-0 text-end">
              <p className="text-4xl font-extrabold tabular leading-none">{card.total_display}</p>
              <p className="mt-1 text-xs text-text-muted">{t("totalPoints")}</p>
              {card.rank !== null && card.rank_of !== null && (
                <p data-testid="card-rank" className="mt-2 text-sm font-bold text-brand-text">
                  {t(card.is_rookie ? "rookieRankOf" : "rankOf", { rank: card.rank, of: card.rank_of })}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={card.attended_today ? "secondary" : "primary"}
            className="flex-1"
            disabled={!canLog || card.attended_today}
            loading={attending}
            onClick={attend}
          >
            {card.attended_today && <CheckIcon size={18} className="text-up" />}
            {card.attended_today ? t("attendedToday") : t("markAttended")}
          </Button>
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilIcon size={18} />
            {t("edit")}
          </Button>
        </div>
      </section>

      {!season && <SeasonBanner current={null} next={next} closed={closedSeason} />}
      {closedSeason && <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold"><LockIcon size={18} />{t("championshipEnded")}</p>}
      {season?.type === "preseason" && <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">{t("preseasonNote")}</p>}
      {error && <p role="alert" className="rounded-2xl border border-down/30 bg-down/10 px-4 py-3 text-sm font-semibold text-down">{error}</p>}

      <section aria-label={t("categories")} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {card.categories.map((tile) => {
          const disabled = !canLog || tile.logged_today;
          const progress = tile.max > 0 ? Math.min(100, (tile.points / tile.max) * 100) : 0;
          const building = tile.code !== "treadmill" && !tile.has_baseline;
          return (
            <button
              key={tile.code}
              type="button"
              disabled={disabled}
              onClick={() => setSheet(tile)}
              aria-label={`${CATEGORY_LABEL[tile.code]}${tile.logged_today ? ` — ${t("loggedToday")}` : ""}`}
              className="flex min-h-32 flex-col rounded-2xl border border-border bg-surface p-4 text-start transition-colors enabled:hover:border-brand/50 enabled:active:bg-surface-2 disabled:cursor-default"
            >
              <span className="flex items-start justify-between gap-2">
                <span dir="ltr" className="font-bold">{CATEGORY_LABEL[tile.code]}</span>
                {tile.logged_today && <CheckIcon size={18} className="shrink-0 text-up" />}
              </span>
              <span className="mt-1 text-sm text-text-muted" dir="ltr">
                {tile.code === "treadmill"
                  ? te("creditedKm", { km: tile.month_best ?? "0.0" })
                  : building
                    ? null
                    : `${tile.baseline ?? "—"} → ${tile.month_best ?? "—"}`}
              </span>
              {building && <span className="mt-1 text-sm font-semibold text-gold">{t("buildingBaseline")}</span>}
              <span className="mt-auto pt-3">
                {championship && (
                  <>
                    <span className="flex items-baseline justify-between text-xs">
                      <span dir="ltr" className="font-bold tabular text-text">{`${tile.points_display} / ${tile.max}`}</span>
                      {tile.at_cap && <span className="font-semibold text-up">{t("max")}</span>}
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                    </span>
                  </>
                )}
                {tile.logged_today ? (
                  <span className="mt-2 block text-xs font-semibold text-up">{t("loggedToday")}</span>
                ) : canLog ? (
                  <span className="mt-2 block text-xs font-semibold text-brand-text">{t("log")}</span>
                ) : null}
              </span>
            </button>
          );
        })}
        <div className="flex min-h-32 flex-col rounded-2xl border border-border bg-surface p-4">
          <span className="flex items-start justify-between gap-2">
            <span className="font-bold">{t("consistency")}</span>
            {card.season && (
              <button type="button" aria-label={t("editPlan")} onClick={() => setPlanOpen(true)} className="-m-2 grid size-11 place-items-center rounded-xl text-text-muted hover:bg-surface-2 hover:text-text">
                <PencilIcon size={16} />
              </button>
            )}
          </span>
          <span className="mt-1 text-sm text-text-muted">{t("attendedOf", { attended: card.attended, planned: card.planned_sessions })}</span>
          {championship && (
            <span className="mt-auto pt-3">
              <span dir="ltr" className="block text-start text-xs font-bold tabular rtl:text-end">{`${card.consistency.points_display} / ${card.consistency.max}`}</span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-up" style={{ width: `${Math.min(100, (card.consistency.points / card.consistency.max) * 100)}%` }} />
              </span>
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-bold">{t("todayEntries")}</h2>
        {card.today_entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-muted">{t("noEntriesToday")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {card.today_entries.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 px-4 py-3 ${e.voided ? "opacity-60" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span dir="ltr" className={`font-bold ${e.voided ? "line-through" : ""}`}>{CATEGORY_LABEL[e.category]}</span>
                    {e.voided && <Badge>{t("undoneBadge")}</Badge>}
                    {e.has_photo && <CameraIcon size={14} className="text-text-muted" aria-label={t("hasPhoto")} />}
                  </span>
                  <span className="block text-sm text-text-muted">
                    <bdi>{entryText(e, te)}</bdi>{" · "}{formatTime(new Date(e.created_at), locale)}
                  </span>
                </span>
                {e.can_undo && <Button variant="ghost" onClick={() => setUndoing(e)}>{t("undo")}</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet && (
        <EntrySheet
          memberId={member.id}
          memberName={member.full_name}
          tile={sheet}
          preseason={season?.type === "preseason"}
          onClose={() => setSheet(null)}
          onSaved={saved}
          onConflict={() => void refreshCard()}
        />
      )}

      {undoing && (
        <Dialog
          open
          onClose={() => setUndoing(null)}
          closeLabel={t("close")}
          title={t("undoTitle")}
          description={<><span dir="ltr">{CATEGORY_LABEL[undoing.category]}</span>{" · "}<bdi>{entryText(undoing, te)}</bdi></>}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUndoing(null)}>{t("keep")}</Button>
              <UndoButton label={t("undoConfirm")} onConfirm={() => undo(undoing.id)} />
            </>
          }
        >
          <p className="text-sm text-text-muted">{t("undoBody")}</p>
        </Dialog>
      )}

      {planOpen && card.season && (
        <PlanDialog
          memberId={member.id}
          planned={card.planned_sessions}
          onClose={() => setPlanOpen(false)}
          onSaved={async () => {
            setPlanOpen(false);
            await refreshCard();
            setToast({ message: t("planSaved") });
          }}
        />
      )}

      {editOpen && (
        <MemberFormDialog
          member={member}
          showCoach={false}
          coaches={[]}
          planEnabled={false}
          onClose={() => setEditOpen(false)}
          onSaved={(message) => {
            setEditOpen(false);
            setToast({ message });
            router.refresh();
          }}
        />
      )}
      <ActionToast toast={toast} onDone={clearToast} />
    </main>
  );
}

function entryText(e: { category: string; weight_kg: string | null; reps: number | null; km: string | null; value: string }, t: ReturnType<typeof useTranslations>) {
  if (e.weight_kg !== null) return t("liftLine", { weight: Number(e.weight_kg), reps: e.reps ?? 0, value: e.value });
  if (e.km !== null) return t("valueKm", { value: e.value });
  return t("valueReps", { value: e.value });
}

function UndoButton({ label, onConfirm }: { label: string; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
      {label}
    </Button>
  );
}

function PlanDialog({ memberId, planned, onClose, onSaved }: { memberId: string; planned: number; onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("coach.card");
  const tm = useTranslations("members");
  const tc = useTranslations("common");
  const errorText = useApiErrorText();
  const [value, setValue] = useState(String(planned));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function save() {
    const n = Number(value);
    if (!Number.isInteger(n) || n < PLANNED_MIN || n > PLANNED_MAX) return setError(tm("errors.invalid_plan", { min: PLANNED_MIN, maxPlan: PLANNED_MAX }));
    setSaving(true);
    const res = await fetch(`/api/members/${memberId}/plan`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ planned_sessions: n }) });
    setSaving(false);
    if (res.ok) return onSaved();
    setError(errorText(((await res.json().catch(() => null)) as { error?: object } | null)?.error ?? {}));
  }
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={t("editPlan")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button loading={saving} onClick={save}>{tc("save")}</Button>
        </>
      }
    >
      <Field label={tm("plannedSessions")} type="number" inputMode="numeric" dir="ltr" min={PLANNED_MIN} max={PLANNED_MAX} value={value} onChange={(e) => setValue(e.target.value)} error={error} hint={tm("plannedHint")} />
    </Dialog>
  );
}
