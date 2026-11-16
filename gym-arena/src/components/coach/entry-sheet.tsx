"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { CameraIcon, CheckIcon } from "@/components/ui/icons";
import { CATEGORY_LABEL, isLiftCategory } from "@/lib/categories";
import { compressImage } from "@/lib/image";
import { normalizeNumberInput } from "@/lib/number-input";
import { createClient } from "@/lib/supabase/client";
import type { CategoryCode, EntryRow } from "@/lib/supabase/types";
import type { CategoryTile, MemberCard, PreviewPayload } from "@/modules/entries/card";
import { api, useApiErrorText, type ApiError } from "./shared";

const REPS_CHIPS = [3, 4, 5] as const;

type Body = { member_id: string; category: CategoryCode; weight_kg?: string; reps?: number; km?: string };
type Photo = { state: "none" } | { state: "uploading" } | { state: "ready"; path: string; preview: string } | { state: "failed" };

export interface SavedEntry {
  entry: EntryRow;
  member_card: MemberCard;
  preview: PreviewPayload | null;
}

/**
 * UX C4 entry sheet. The preview comes from the server (modules/scoring on the stored
 * history) — the same computation the save uses, so they cannot disagree. The photo rule
 * is enforced by the server too (422 PHOTO_REQUIRED); the sheet only explains it.
 */
export function EntrySheet({
  memberId,
  memberName,
  tile,
  preseason,
  onClose,
  onSaved,
  onConflict,
}: {
  memberId: string;
  memberName: string;
  tile: CategoryTile;
  preseason: boolean;
  onClose: () => void;
  onSaved: (saved: SavedEntry) => void;
  onConflict: () => void;
}) {
  const t = useTranslations("coach.entry");
  const tc = useTranslations("common");
  const errorText = useApiErrorText();
  const category = tile.code;
  const lift = isLiftCategory(category);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState<number | null>(lift ? null : category === "treadmill" ? null : 0);
  const [repsText, setRepsText] = useState("");
  const [km, setKm] = useState("");
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [photo, setPhoto] = useState<Photo>({ state: "none" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false); // double-tap / retry guard
  const fileInput = useRef<HTMLInputElement>(null);
  const lastFile = useRef<File | null>(null);

  const body: Body | null = (() => {
    if (lift) {
      const w = normalizeNumberInput(weight);
      return w && reps !== null ? { member_id: memberId, category, weight_kg: w, reps } : null;
    }
    if (category === "treadmill") {
      const k = normalizeNumberInput(km);
      return k ? { member_id: memberId, category, km: k } : null;
    }
    const r = normalizeNumberInput(repsText);
    return r !== "" && /^\d+$/.test(r) ? { member_id: memberId, category, reps: Number(r) } : null;
  })();
  const bodyKey = body ? JSON.stringify(body) : "";

  // Live preview, debounced 300 ms (UX C4)
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    setSaveError(null);
    if (!body) return;
    setPreviewing(true);
    const controller = { cancelled: false };
    const timer = setTimeout(async () => {
      const res = await api<PreviewPayload>("/api/entries/preview", body);
      if (controller.cancelled) return;
      setPreviewing(false);
      if (res.ok) setPreview(res.data);
      else {
        setPreviewError(errorText(res.error));
        if (res.error.code === "ALREADY_LOGGED_TODAY") onConflict();
      }
    }, 300);
    return () => {
      controller.cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bodyKey captures the input
  }, [bodyKey]);

  async function upload(file: File) {
    lastFile.current = file;
    setPhoto({ state: "uploading" });
    try {
      const image = await compressImage(file);
      const signed = await api<{ path: string; token: string }>("/api/uploads/evidence", { member_id: memberId, content_type: image.type });
      if (!signed.ok) return setPhoto({ state: "failed" });
      const { error } = await createClient().storage.from("evidence").uploadToSignedUrl(signed.data.path, signed.data.token, image.blob, { contentType: image.type });
      if (error) return setPhoto({ state: "failed" });
      setPhoto({ state: "ready", path: signed.data.path, preview: URL.createObjectURL(image.blob) });
    } catch {
      setPhoto({ state: "failed" });
    }
  }
  useEffect(() => () => { if (photo.state === "ready") URL.revokeObjectURL(photo.preview); }, [photo]);

  const photoRequired = !!preview?.photo_required;
  const canSave = !!body && !!preview && !saving && photo.state !== "uploading" && (!photoRequired || photo.state === "ready");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!body || !canSave || inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    const res = await api<{ entry: EntryRow; member_card: MemberCard }>("/api/entries", {
      ...body,
      ...(photo.state === "ready" ? { photo_path: photo.path } : {}),
    });
    setSaving(false);
    inFlight.current = false;
    if (res.ok) return onSaved({ ...res.data, preview });
    setSaveError(errorText(res.error as ApiError));
    if (res.error.code === "ALREADY_LOGGED_TODAY") onConflict();
  }

  const valueLine = (p: PreviewPayload) =>
    lift ? t("valueE1rm", { value: p.value }) : category === "treadmill" ? t("valueKm", { value: p.value }) : t("valueReps", { value: p.value });

  return (
    <Dialog
      open
      onClose={onClose}
      closeLabel={tc("close")}
      title={<span dir="ltr">{CATEGORY_LABEL[category]}</span>}
      description={<bdi>{memberName}</bdi>}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>{tc("cancel")}</Button>
          <Button type="submit" form="entry-form" size="lg" loading={saving} disabled={!canSave}>{tc("save")}</Button>
        </>
      }
    >
      <form id="entry-form" onSubmit={save} noValidate className="space-y-5">
        {tile.baseline !== null || tile.month_best !== null ? (
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-text-muted">
            {tile.baseline !== null && <span>{t("baseline")} <span dir="ltr" className="font-semibold text-text">{tile.baseline}</span></span>}
            {tile.baseline !== null && tile.month_best !== null && " · "}
            {tile.month_best !== null && <span>{category === "treadmill" ? t("credited") : t("best")} <span dir="ltr" className="font-semibold text-text">{tile.month_best}</span></span>}
          </p>
        ) : null}

        {lift && (
          <>
            <Field label={t("weight")} type="text" inputMode="decimal" dir="ltr" autoFocus value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.0" hint={t("weightHint")} />
            <div>
              <p className="mb-1.5 text-start text-sm font-semibold">{t("reps")}</p>
              <div role="radiogroup" aria-label={t("reps")} className="grid grid-cols-3 gap-2">
                {REPS_CHIPS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={reps === r}
                    onClick={() => setReps(r)}
                    className={`min-h-12 rounded-xl border text-lg font-extrabold tabular transition-colors ${reps === r ? "border-brand bg-brand text-white" : "border-border bg-surface-2 text-text hover:border-text-muted/40"}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {(category === "pullups" || category === "pushups") && (
          <div>
            <p className="mb-1.5 text-start text-sm font-semibold">{t("reps")}</p>
            <div className="flex items-stretch gap-2" dir="ltr">
              <button type="button" aria-label={t("decrease")} onClick={() => setRepsText(String(Math.max(0, Number(normalizeNumberInput(repsText) || 0) - 1)))} className="min-h-14 w-16 rounded-xl border border-border bg-surface-2 text-2xl font-bold">{"−"}</button>
              <input
                aria-label={t("reps")}
                inputMode="numeric"
                value={repsText}
                onChange={(e) => setRepsText(e.target.value)}
                placeholder="0"
                className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 text-center text-3xl font-extrabold tabular outline-none focus:border-brand-text"
              />
              <button type="button" aria-label={t("increase")} onClick={() => setRepsText(String(Number(normalizeNumberInput(repsText) || 0) + 1))} className="min-h-14 w-16 rounded-xl border border-border bg-surface-2 text-2xl font-bold">{"+"}</button>
            </div>
          </div>
        )}

        {category === "treadmill" && (
          <Field label={t("km")} type="text" inputMode="decimal" dir="ltr" autoFocus value={km} onChange={(e) => setKm(e.target.value)} placeholder="0.0" hint={t("kmHint")} />
        )}

        <div aria-live="polite" className="min-h-20 rounded-2xl border border-border bg-surface-2 px-4 py-3">
          {!body ? (
            <p className="text-sm text-text-muted">{t("enterValue")}</p>
          ) : previewing && !preview ? (
            <p className="text-sm text-text-muted">{t("calculating")}</p>
          ) : previewError ? (
            <p role="alert" className="text-sm font-semibold text-down">{previewError}</p>
          ) : preview ? (
            <div className="space-y-1">
              <p className="text-sm text-text-muted"><bdi>{valueLine(preview)}</bdi></p>
              {preseason ? (
                <p className="font-bold">{t("preseasonNote")}</p>
              ) : preview.points_delta > 0 ? (
                <p className="text-lg font-extrabold text-up">
                  {preview.is_new_best && <span className="me-2">{t("newBest")}</span>}
                  {t("plusPoints", { points: preview.points_delta_display })}
                </p>
              ) : (
                <p className="font-semibold">{preview.is_new_best ? t("newBestNoPoints") : t("noPointsChange")}</p>
              )}
              {!preseason && <p className="text-xs text-text-muted">{t("totalAfter", { total: preview.total_after_display })}</p>}
            </div>
          ) : null}
        </div>

        <div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label={t("takePhoto")}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }}
          />
          {photo.state === "ready" ? (
            <div className="flex items-center gap-3 rounded-2xl border border-up/30 bg-up/10 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.preview} alt={t("photoAlt")} className="size-14 rounded-xl object-cover" />
              <p className="flex-1 text-sm font-semibold"><CheckIcon size={16} className="me-1 inline text-up" />{t("photoReady")}</p>
              <Button type="button" variant="ghost" onClick={() => fileInput.current?.click()}>{t("retake")}</Button>
            </div>
          ) : (
            <Button
              type="button"
              variant={photoRequired ? "primary" : "secondary"}
              className="w-full"
              loading={photo.state === "uploading"}
              onClick={() => (photo.state === "failed" && lastFile.current ? void upload(lastFile.current) : fileInput.current?.click())}
            >
              <CameraIcon size={18} />
              {photo.state === "uploading" ? t("uploading") : photo.state === "failed" ? t("retryUpload") : photoRequired ? t("photoRequired") : t("photoOptional")}
            </Button>
          )}
          {photo.state === "failed" && <p role="alert" className="mt-2 text-sm font-semibold text-down">{t("uploadFailed")}</p>}
          {photoRequired && photo.state !== "ready" && <p className="mt-2 text-sm text-text-muted">{t("photoRequiredWhy")}</p>}
        </div>

        {saveError && <p role="alert" className="rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm font-semibold text-down">{saveError}</p>}
      </form>
    </Dialog>
  );
}
