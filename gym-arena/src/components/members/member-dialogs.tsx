"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/field";
import { PencilIcon, SwapIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import { initials } from "@/lib/initials";
import { formatEgyptianMobile } from "@/lib/phone";
import type { MemberDetail } from "@/modules/members/service";
import type { CoachOption } from "./member-form";

type ApiError = { code?: string; reason?: string };
async function post(url: string, body: object): Promise<ApiError | null> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return null;
    return (((await res.json().catch(() => null)) as { error?: ApiError } | null)?.error ?? {});
  } catch {
    return {};
  }
}
function useErrorText() {
  const t = useTranslations("members");
  const te = useTranslations("errors");
  return (e: ApiError) => (e.reason && t.has(`errors.${e.reason}` as never) ? t(`errors.${e.reason}` as never) : e.code && te.has(e.code as never) ? te(e.code as never) : te("UNKNOWN"));
}

/** "View card" (decision 3): profile, photo, coach history, current-season plan. */
export function MemberDetailDialog({
  member,
  locale,
  onClose,
  onEdit,
  onReassign,
  onStatus,
}: {
  member: MemberDetail;
  locale: Locale;
  onClose: () => void;
  onEdit: () => void;
  onReassign: () => void;
  onStatus: () => void;
}) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const active = member.status === "active";
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={<bdi>{member.full_name}</bdi>}
      description={<span dir="ltr">{member.member_code}</span>}
      footer={
        <>
          <Button type="button" variant={active ? "danger" : "secondary"} onClick={onStatus}>{active ? t("deactivate") : t("reactivate")}</Button>
          {active && (
            <Button type="button" variant="secondary" onClick={onReassign}>
              <SwapIcon size={18} />
              {t("reassign")}
            </Button>
          )}
          <Button type="button" onClick={onEdit}>
            <PencilIcon size={18} />
            {t("edit")}
          </Button>
        </>
      }
    >
      <div className="space-y-6 text-start">
        <div className="flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-xl font-bold text-text-muted">
            {member.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={member.photo_url} alt={t("photoAlt")} className="size-full object-cover" />
            ) : (
              initials(member.full_name)
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={active ? "success" : "neutral"}>{active ? t("status.active") : t("status.inactive")}</Badge>
            {member.is_rookie && <Badge tone="warning">{t("rookie")}</Badge>}
            <Badge tone={member.photo_consent ? "brand" : "neutral"}>{member.photo_consent ? t("consentYes") : t("consentNo")}</Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <dt className="text-text-muted">{t("phone")}</dt>
          <dd className="font-semibold tabular"><span dir="ltr">{formatEgyptianMobile(member.phone)}</span></dd>
          <dt className="text-text-muted">{t("coach")}</dt>
          <dd className="font-semibold"><bdi>{member.coach_name ?? "—"}</bdi></dd>
          <dt className="text-text-muted">{t("joined")}</dt>
          <dd className="font-semibold">{formatDate(member.joined_on, locale)}</dd>
          <dt className="text-text-muted">{t("currentPlan")}</dt>
          <dd className="font-semibold">
            {member.plan ? t("planValue", { count: member.plan.planned_sessions }) : t("noActiveSeason")}
          </dd>
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-bold">{t("history")}</h3>
          <ol className="space-y-2">
            {member.assignments.map((a) => (
              <li key={a.started_at} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-sm">
                <span className="font-semibold"><bdi>{a.coach_name ?? "—"}</bdi></span>
                <span className="text-text-muted">
                  {formatDate(a.started_at.slice(0, 10), locale)} — {a.ended_at ? formatDate(a.ended_at.slice(0, 10), locale) : t("current")}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Dialog>
  );
}

/** Reassign to another ACTIVE coach (BR-P6, decision 1). */
export function ReassignDialog({ member, coaches, onClose, onSaved }: { member: MemberDetail; coaches: CoachOption[]; onClose: () => void; onSaved: (m: string) => void }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const options = coaches.filter((c) => c.id !== member.coach_id);
  const [coachId, setCoachId] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function confirm() {
    if (!coachId) return setError(t("errors.coach_required"));
    setSaving(true);
    const e = await post(`/api/members/${member.id}/reassign`, { coach_id: coachId });
    setSaving(false);
    if (!e) return onSaved(t("toastReassigned"));
    setError(errorText(e));
  }
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={t("reassignTitle")}
      description={<bdi>{member.full_name}</bdi>}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="button" loading={saving} onClick={confirm} disabled={options.length === 0}>{t("reassign")}</Button>
        </>
      }
    >
      <div className="space-y-4 text-start text-sm">
        <p className="text-text-muted">{t("reassignBody", { coach: member.coach_name ?? "—" })}</p>
        {options.length === 0 ? (
          <p role="alert" className="font-semibold text-down">{t("errors.no_other_coach")}</p>
        ) : (
          <SelectField label={t("newCoach")} value={coachId} onChange={(e) => setCoachId(e.target.value)} error={error}>
            <option value="">{t("chooseCoach")}</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </SelectField>
        )}
      </div>
    </Dialog>
  );
}

/** Deactivate (BR-P5) / reactivate with a required active coach (decision 5). */
export function MemberStatusDialog({ member, coaches, onClose, onSaved }: { member: MemberDetail; coaches: CoachOption[]; onClose: () => void; onSaved: (m: string) => void }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const deactivating = member.status === "active";
  const currentCoachActive = coaches.some((c) => c.id === member.coach_id);
  const [coachId, setCoachId] = useState(currentCoachActive ? member.coach_id : "");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function confirm() {
    if (!deactivating && !coachId) return setError(t("errors.coach_required"));
    setSaving(true);
    const body = deactivating ? { status: "inactive" } : { status: "active", coach_id: coachId };
    const e = await post(`/api/members/${member.id}/status`, body);
    setSaving(false);
    if (!e) return onSaved(deactivating ? t("toastDeactivated") : t("toastReactivated"));
    setError(errorText(e));
  }
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={deactivating ? t("deactivateTitle") : t("reactivateTitle")}
      description={<bdi>{member.full_name}</bdi>}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="button" variant={deactivating ? "danger" : "primary"} loading={saving} onClick={confirm}>
            {deactivating ? t("deactivate") : t("reactivate")}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-start text-sm">
        {deactivating ? (
          <>
            <ul className="list-disc space-y-2 ps-5 text-text-muted">
              <li>{t("deactivateEffectHidden")}</li>
              <li>{t("deactivateEffectEntries")}</li>
              <li>{t("deactivateEffectHistory")}</li>
              <li>{t("deactivateEffectUndo")}</li>
            </ul>
            {error && <p role="alert" className="font-semibold text-down">{error}</p>}
          </>
        ) : (
          <>
            <p className="text-text-muted">{currentCoachActive ? t("reactivateBody") : t("reactivateNeedsCoach")}</p>
            <SelectField label={t("coach")} value={coachId} onChange={(e) => setCoachId(e.target.value)} error={error}>
              <option value="">{t("chooseCoach")}</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </SelectField>
          </>
        )}
      </div>
    </Dialog>
  );
}
