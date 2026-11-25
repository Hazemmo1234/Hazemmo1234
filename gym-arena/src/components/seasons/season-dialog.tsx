"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Segmented } from "@/components/ui/field";
import type { Locale } from "@/i18n/config";
import { formatMonthYear } from "@/lib/i18n/format";
import type { IsoDate } from "@/lib/time";
import { createSeasonSchema, updateSeasonSchema, SEASON_NAME_MAX } from "@/lib/validation/seasons";
import { checkSeasonUpdate } from "@/modules/seasons/rules";
import type { SeasonStatus, SeasonType } from "@/modules/seasons/status";

export interface EditableSeason {
  id: string;
  name: string;
  type: SeasonType;
  starts_on: IsoDate;
  ends_on: IsoDate;
  closed_at: string | null;
  status: SeasonStatus;
}

type Mode = { kind: "create"; suggestion: { startsOn: IsoDate; endsOn: IsoDate } } | { kind: "edit"; season: EditableSeason };
type FieldName = "name" | "starts_on" | "ends_on" | "form";

/** Create / edit season (UX A2). Validation is shared with the API; the server re-checks everything. */
export function SeasonDialog({
  mode,
  today,
  locale,
  onClose,
  onSaved,
}: {
  mode: Mode;
  today: IsoDate;
  locale: Locale;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const t = useTranslations("seasons");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const editing = mode.kind === "edit" ? mode.season : null;
  const started = editing ? editing.status !== "scheduled" : false;

  const [name, setName] = useState(
    editing?.name ?? t("suggestedName", { month: formatMonthYear(mode.kind === "create" ? mode.suggestion.startsOn : today, locale) }),
  );
  const [type, setType] = useState<SeasonType>(editing?.type ?? "championship");
  const [startsOn, setStartsOn] = useState<IsoDate>(editing?.starts_on ?? (mode.kind === "create" ? mode.suggestion.startsOn : today));
  const [endsOn, setEndsOn] = useState<IsoDate>(editing?.ends_on ?? (mode.kind === "create" ? mode.suggestion.endsOn : today));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saving, setSaving] = useState(false);

  const reasonMessage = (reason: string | undefined, code?: string): { field: FieldName; text: string } => {
    switch (reason) {
      case "name_required":
      case "name_too_long":
        return { field: "name", text: t(`errors.${reason}`, { max: SEASON_NAME_MAX }) };
      case "invalid_date":
      case "end_before_start":
      case "extend_only":
      case "before_entries":
        return { field: "ends_on", text: t(`errors.${reason}`) };
      case "started":
        return { field: "starts_on", text: t("errors.started") };
      case "overlap":
      case "closed":
      case "nothing_to_update":
        return { field: "form", text: t(`errors.${reason}`) };
      default:
        return { field: "form", text: code && te.has(code as never) ? te(code as never) : te("UNKNOWN") };
    }
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    let body: Record<string, string>;
    if (editing) {
      const patch: Record<string, string> = {};
      if (name.trim() !== editing.name) patch.name = name;
      if (!started && startsOn !== editing.starts_on) patch.starts_on = startsOn;
      if (endsOn !== editing.ends_on) patch.ends_on = endsOn;
      if (Object.keys(patch).length === 0) return onClose(); // nothing changed
      const parsed = updateSeasonSchema.safeParse(patch);
      if (!parsed.success) {
        const m = reasonMessage(parsed.error.issues[0]?.message);
        return setErrors({ [m.field]: m.text });
      }
      const violation = checkSeasonUpdate(editing, parsed.data, today);
      if (violation) {
        const m = reasonMessage(violation.reason);
        return setErrors({ [m.field]: m.text });
      }
      body = patch;
    } else {
      const parsed = createSeasonSchema.safeParse({ name, type, starts_on: startsOn, ends_on: endsOn });
      if (!parsed.success) {
        const m = reasonMessage(parsed.error.issues[0]?.message);
        return setErrors({ [m.field]: m.text });
      }
      body = parsed.data;
    }

    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/seasons/${editing.id}` : "/api/seasons", {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return onSaved(editing ? t("toastUpdated") : t("toastCreated"));
      const payload = (await res.json().catch(() => null)) as { error?: { code?: string; reason?: string } } | null;
      const m = reasonMessage(payload?.error?.reason, payload?.error?.code);
      setErrors({ [m.field]: m.text });
    } catch {
      setErrors({ form: te("UNKNOWN") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={editing ? t("editTitle") : t("createTitle")}
      description={editing ? <bdi>{editing.name}</bdi> : t("createDescription")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="submit" form="season-form" loading={saving}>{editing ? tc("save") : t("create")}</Button>
        </>
      }
    >
      <form id="season-form" onSubmit={submit} noValidate className="space-y-5">
        {errors.form && (
          <p role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-start text-sm font-semibold text-down">{errors.form}</p>
        )}
        <Field label={t("name")} value={name} onChange={(e) => setName(e.target.value)} maxLength={SEASON_NAME_MAX} required error={errors.name} autoComplete="off" />
        {!editing && (
          <Segmented
            label={t("type")}
            value={type}
            onChange={setType}
            options={[
              { value: "championship", label: t("typeLabel.championship") },
              { value: "preseason", label: t("typeLabel.preseason") },
            ]}
          />
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label={t("startsOn")}
            type="date"
            dir="ltr"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            disabled={started}
            hint={started ? t("hintStartLocked") : undefined}
            error={errors.starts_on}
            required
          />
          <Field
            label={t("endsOn")}
            type="date"
            dir="ltr"
            value={endsOn}
            min={started && editing ? editing.ends_on : startsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            hint={started ? t("hintExtendOnly") : undefined}
            error={errors.ends_on}
            required
          />
        </div>
        {!editing && <p className="text-start text-xs text-text-muted">{t("hintParticipants")}</p>}
      </form>
    </Dialog>
  );
}
