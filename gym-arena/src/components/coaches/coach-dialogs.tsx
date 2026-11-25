"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { AlertIcon, EyeIcon, EyeOffIcon } from "@/components/ui/icons";
import { COACH_NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, createCoachSchema, updateCoachSchema } from "@/lib/validation/coaches";
import type { CoachListItem } from "@/modules/coaches/service";

type ApiError = { code?: string; reason?: string };

async function send(url: string, method: "POST" | "PATCH", body: object): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    const payload = (await res.json().catch(() => null)) as { error?: ApiError } | null;
    return { ok: false, error: payload?.error ?? {} };
  } catch {
    return { ok: false, error: {} };
  }
}

function useErrorText() {
  const t = useTranslations("coaches");
  const te = useTranslations("errors");
  return (error: ApiError): string => {
    if (error.reason && t.has(`errors.${error.reason}` as never)) {
      return t(`errors.${error.reason}` as never, { min: PASSWORD_MIN, max: COACH_NAME_MAX, maxPassword: PASSWORD_MAX } as never);
    }
    return error.code && te.has(error.code as never) ? te(error.code as never) : te("UNKNOWN");
  };
}

function FormError({ text }: { text?: string }) {
  if (!text) return null;
  return <p role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-start text-sm font-semibold text-down">{text}</p>;
}

/** Create a coach account (UX A4): name, email, temporary password. */
export function CreateCoachDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const t = useTranslations("coaches");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ full_name?: string; email?: string; password?: string; form?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    const parsed = createCoachSchema.safeParse({ full_name: fullName, email, password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue.path[0]) as "full_name" | "email" | "password";
      return setErrors({ [field]: errorText({ reason: issue.message }) });
    }
    setSaving(true);
    const result = await send("/api/coaches", "POST", parsed.data);
    setSaving(false);
    if (result.ok) return onSaved(t("toastCreated"));
    const field = result.error.reason === "email_taken" ? "email" : result.error.reason?.startsWith("password") ? "password" : "form";
    setErrors({ [field]: errorText(result.error) });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={t("createTitle")}
      description={t("createDescription")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="submit" form="coach-form" loading={saving}>{t("create")}</Button>
        </>
      }
    >
      <form id="coach-form" onSubmit={submit} noValidate className="space-y-5">
        <FormError text={errors.form} />
        <Field label={t("fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={COACH_NAME_MAX} autoComplete="off" required error={errors.full_name} />
        <Field label={t("email")} type="email" dir="ltr" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required error={errors.email} />
        <Field
          label={t("password")}
          type={show ? "text" : "password"}
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          required
          hint={t("passwordHint", { min: PASSWORD_MIN })}
          error={errors.password}
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? t("hidePassword") : t("showPassword")}
              aria-pressed={show}
              className="grid size-11 place-items-center rounded-lg text-text-muted hover:text-text"
            >
              {show ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
            </button>
          }
        />
      </form>
    </Dialog>
  );
}

/** Rename a coach. */
export function RenameCoachDialog({ coach, onClose, onSaved }: { coach: CoachListItem; onClose: () => void; onSaved: (message: string) => void }) {
  const t = useTranslations("coaches");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  const [fullName, setFullName] = useState(coach.full_name);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (fullName.trim() === coach.full_name) return onClose();
    const parsed = updateCoachSchema.safeParse({ full_name: fullName });
    if (!parsed.success) return setError(errorText({ reason: parsed.error.issues[0].message }));
    setSaving(true);
    const result = await send(`/api/coaches/${coach.id}`, "PATCH", parsed.data);
    setSaving(false);
    if (result.ok) return onSaved(t("toastRenamed"));
    setError(errorText(result.error));
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={t("renameTitle")}
      description={<bdi>{coach.email}</bdi>}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="submit" form="rename-form" loading={saving}>{tc("save")}</Button>
        </>
      }
    >
      <form id="rename-form" onSubmit={submit} noValidate>
        <Field label={t("fullName")} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={COACH_NAME_MAX} required error={error} autoComplete="off" />
      </form>
    </Dialog>
  );
}

/**
 * Deactivate / reactivate (BR-P7, D28). When the coach still has active clients the
 * dialog explains why deactivation is blocked; the database rule stays authoritative
 * (a race is still rejected by the server and shown the same way).
 */
export function CoachStatusDialog({
  coach,
  membersAvailable,
  onClose,
  onSaved,
}: {
  coach: CoachListItem;
  membersAvailable: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useTranslations("coaches");
  const tc = useTranslations("common");
  const errorText = useErrorText();
  // deactivate: active coach · complete: profile inactive but the Auth block did not apply
  // (a previous partial failure) — retry it · reactivate: inactive and blocked
  const mode: "deactivate" | "complete" | "reactivate" = coach.is_active ? "deactivate" : coach.sign_in_blocked ? "reactivate" : "complete";
  const deactivating = mode !== "reactivate";
  const [blockedCount, setBlockedCount] = useState(mode === "deactivate" ? coach.active_clients : 0);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const blocked = deactivating && blockedCount > 0;

  async function confirm() {
    setError(undefined);
    setSaving(true);
    const result = await send(`/api/coaches/${coach.id}`, "PATCH", { is_active: !deactivating });
    setSaving(false);
    if (result.ok) return onSaved(deactivating ? t("toastDeactivated") : t("toastReactivated"));
    if (result.error.reason === "has_active_clients") return setBlockedCount(Math.max(1, coach.active_clients));
    setError(errorText(result.error));
  }

  const name = <bdi>{coach.full_name}</bdi>;
  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={blocked ? t("blockedTitle") : mode === "deactivate" ? t("deactivateTitle") : mode === "complete" ? t("completeTitle") : t("reactivateTitle")}
      description={name}
      footer={
        blocked ? (
          <>
            {membersAvailable && (
              <Link href={`/admin/members?coach=${coach.id}`} className={buttonClasses("primary")}>{t("openMembers")}</Link>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>{tc("close")}</Button>
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
            <Button type="button" variant={deactivating ? "danger" : "primary"} loading={saving} onClick={confirm}>
              {mode === "deactivate" ? t("deactivate") : mode === "complete" ? t("complete") : t("reactivate")}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-start text-sm">
        <FormError text={error} />
        {blocked ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3">
              <AlertIcon className="mt-0.5 text-gold" />
              <p className="font-semibold">{t("blockedBody", { count: blockedCount })}</p>
            </div>
            <p className="text-text-muted">{membersAvailable ? t("blockedReassign") : t("blockedReassignLater")}</p>
          </>
        ) : mode === "complete" ? (
          <p className="text-text-muted">{t("completeBody")}</p>
        ) : deactivating ? (
          <ul className="list-disc space-y-2 ps-5 text-text-muted">
            <li>{t("deactivateEffectSignIn")}</li>
            <li>{t("deactivateEffectSessions")}</li>
            <li>{t("deactivateEffectHistory")}</li>
            <li>{t("deactivateEffectUndo")}</li>
          </ul>
        ) : (
          <p className="text-text-muted">{t("reactivateBody")}</p>
        )}
      </div>
    </Dialog>
  );
}
