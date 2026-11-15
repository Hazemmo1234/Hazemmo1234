"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CheckboxField, Field, SelectField } from "@/components/ui/field";
import { CameraIcon } from "@/components/ui/icons";
import { initials } from "@/lib/initials";
import { formatEgyptianMobile } from "@/lib/phone";
import { MEMBER_NAME_MAX, PLANNED_MAX, PLANNED_MIN, createMemberSchema, updateMemberSchema } from "@/lib/validation/members";
import { removeMemberPhoto, replaceMemberPhoto } from "./photo-upload";

export interface CoachOption {
  id: string;
  full_name: string;
}

export interface EditableMember {
  id: string;
  full_name: string;
  phone: string;
  photo_consent: boolean;
  photo_url: string | null;
  has_photo: boolean;
  plan: { planned_sessions: number } | null;
}

type ApiError = { code?: string; reason?: string; existing_code?: string };
type FieldName = "full_name" | "phone" | "coach_id" | "planned_sessions" | "photo" | "form";

/**
 * Shared Member Form (UX C5) — used by the admin now and by coaches in M3. Coaches get no
 * coach picker: the server (and the database) assign the member to them (AC-5).
 */
export function MemberFormDialog({
  member,
  showCoach,
  coaches,
  defaultCoachId,
  planEnabled,
  onClose,
  onSaved,
}: {
  member?: EditableMember;
  showCoach: boolean;
  coaches: CoachOption[];
  defaultCoachId?: string;
  planEnabled: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const editing = !!member;
  const [fullName, setFullName] = useState(member?.full_name ?? "");
  const [phone, setPhone] = useState(member ? formatEgyptianMobile(member.phone) : "");
  const [consent, setConsent] = useState(member?.photo_consent ?? false);
  const [coachId, setCoachId] = useState(defaultCoachId ?? "");
  const [planned, setPlanned] = useState(String(member?.plan?.planned_sessions ?? 12));
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [preview, setPreview] = useState<string | null>(member?.photo_url ?? null);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (photo && preview) URL.revokeObjectURL(preview); }, [photo, preview]);

  const reasonText = (e: ApiError): { field: FieldName; text: string } => {
    const r = e.reason ?? "";
    const known = t.has(`errors.${r}` as never);
    const text = known ? t(`errors.${r}` as never, { max: MEMBER_NAME_MAX, min: PLANNED_MIN, maxPlan: PLANNED_MAX, code: e.existing_code ?? "" } as never) : e.code && te.has(e.code as never) ? te(e.code as never) : te("UNKNOWN");
    const field: FieldName =
      r.startsWith("name") ? "full_name"
      : r === "invalid_phone" || r === "phone_taken" ? "phone"
      : r === "coach_required" || r === "coach_not_active" ? "coach_id"
      : r === "invalid_plan" ? "planned_sessions"
      : r.startsWith("photo") || r === "invalid_photo" ? "photo"
      : "form";
    return { field, text: r === "phone_taken" && e.existing_code ? t("errors.phone_taken_code", { code: e.existing_code }) : text };
  };

  function choosePhoto(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setErrors({ photo: t("errors.photo_unreadable") });
    setErrors({});
    setPhoto(file);
    setRemovePhoto(false);
    setPreview(URL.createObjectURL(file));
  }

  async function send(url: string, method: string, body: object) {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = res.ok ? await res.json().catch(() => ({})) : null;
    const error = res.ok ? null : (((await res.json().catch(() => null)) as { error?: ApiError } | null)?.error ?? {});
    return { ok: res.ok, payload, error };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const plannedNumber = Number(planned);
    try {
      setSaving(true);
      let memberId = member?.id;
      if (!editing) {
        const parsed = createMemberSchema.safeParse({
          full_name: fullName,
          phone,
          photo_consent: consent,
          ...(showCoach ? { coach_id: coachId || undefined } : {}),
          ...(planEnabled ? { planned_sessions: plannedNumber } : {}),
        });
        if (!parsed.success) {
          const m = reasonText({ reason: parsed.error.issues[0].message });
          return setErrors({ [m.field]: m.text });
        }
        if (showCoach && !coachId) return setErrors({ coach_id: t("errors.coach_required") });
        const created = await send("/api/members", "POST", parsed.data);
        if (!created.ok) {
          const m = reasonText(created.error!);
          return setErrors({ [m.field]: m.text });
        }
        memberId = (created.payload as { member: { id: string } }).member.id;
      } else {
        const patch: Record<string, unknown> = {};
        if (fullName.trim() !== member!.full_name) patch.full_name = fullName;
        if (phone !== formatEgyptianMobile(member!.phone)) patch.phone = phone;
        if (consent !== member!.photo_consent) patch.photo_consent = consent;
        if (Object.keys(patch).length > 0) {
          const parsed = updateMemberSchema.safeParse(patch);
          if (!parsed.success) {
            const m = reasonText({ reason: parsed.error.issues[0].message });
            return setErrors({ [m.field]: m.text });
          }
          const updated = await send(`/api/members/${memberId}`, "PATCH", parsed.data);
          if (!updated.ok) {
            const m = reasonText(updated.error!);
            return setErrors({ [m.field]: m.text });
          }
        }
        if (member!.plan && plannedNumber !== member!.plan.planned_sessions) {
          if (!Number.isInteger(plannedNumber) || plannedNumber < PLANNED_MIN || plannedNumber > PLANNED_MAX) {
            return setErrors({ planned_sessions: t("errors.invalid_plan", { min: PLANNED_MIN, maxPlan: PLANNED_MAX }) });
          }
          const plan = await send(`/api/members/${memberId}/plan`, "PATCH", { planned_sessions: plannedNumber });
          if (!plan.ok) {
            const m = reasonText(plan.error!);
            return setErrors({ [m.field]: m.text });
          }
        }
      }

      // Photo last: the member's details are already saved. A failed photo never removes
      // the photo they had (decision 4) — the form says so and stays open to retry.
      if (photo && memberId) {
        const result = await replaceMemberPhoto(memberId, photo);
        if (!result.ok) return setErrors({ photo: t(editing ? "errors.photo_failed_kept" : "errors.photo_failed_saved") });
      } else if (removePhoto && memberId) {
        const result = await removeMemberPhoto(memberId);
        if (!result.ok) return setErrors({ photo: t("errors.photo_failed_kept") });
      }
      onSaved(editing ? t("toastUpdated") : t("toastCreated"));
    } catch {
      setErrors({ form: te("UNKNOWN") });
    } finally {
      setSaving(false);
    }
  }

  const showPlan = editing ? !!member?.plan : planEnabled;
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={editing ? t("editTitle") : t("createTitle")}
      description={editing ? <bdi>{member!.full_name}</bdi> : t("createDescription")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="submit" form="member-form" loading={saving}>{editing ? tc("save") : t("create")}</Button>
        </>
      }
    >
      <form id="member-form" onSubmit={submit} noValidate className="space-y-5">
        {errors.form && (
          <p role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-start text-sm font-semibold text-down">{errors.form}</p>
        )}

        <div className="flex items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-xl font-bold text-text-muted">
            {preview && !removePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: preview or short-lived signed URL
              <img src={preview} alt={t("photoAlt")} className="size-full object-cover" />
            ) : (
              initials(fullName) || <CameraIcon size={28} />
            )}
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
              <CameraIcon size={18} />
              {preview && !removePhoto ? t("changePhoto") : t("addPhoto")}
            </Button>
            {preview && !removePhoto && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPhoto(null);
                  setPreview(null);
                  setRemovePhoto(!!member?.has_photo);
                }}
              >
                {t("removePhoto")}
              </Button>
            )}
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => choosePhoto(e.target.files?.[0])} aria-label={t("addPhoto")} />
          </div>
        </div>
        {errors.photo && <p role="alert" className="-mt-2 text-start text-sm font-semibold text-down">{errors.photo}</p>}

        <Field label={t("fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={MEMBER_NAME_MAX} autoComplete="off" required error={errors.full_name} />
        <Field label={t("phone")} type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010 1234 5678" autoComplete="off" required hint={t("phoneHint")} error={errors.phone} />

        {showCoach && !editing && (
          <SelectField label={t("coach")} value={coachId} onChange={(e) => setCoachId(e.target.value)} required error={errors.coach_id}>
            <option value="">{t("chooseCoach")}</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </SelectField>
        )}

        {showPlan && (
          <Field
            label={t("plannedSessions")}
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={PLANNED_MIN}
            max={PLANNED_MAX}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
            hint={t("plannedHint")}
            error={errors.planned_sessions}
          />
        )}

        <CheckboxField label={t("consent")} checked={consent} onChange={setConsent} />
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-start text-xs text-text-muted">{t("registrationNote")}</p>
      </form>
    </Dialog>
  );
}
