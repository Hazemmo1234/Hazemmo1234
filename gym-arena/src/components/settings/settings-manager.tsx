"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NATIVE_NAME } from "@/components/language-switcher";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Segmented } from "@/components/ui/field";
import { AlertIcon, CopyIcon, ExternalIcon, EyeIcon, EyeOffIcon, RefreshIcon, TvIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Toast, useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/config";
import type { AdminSettings } from "@/modules/settings/service";

type ApiError = { error?: { code?: string } };

/** The TV link with its key masked — what is shown until the admin chooses to reveal it. */
export function maskTvUrl(url: string): string {
  const at = url.indexOf("key=");
  if (at < 0) return url;
  return `${url.slice(0, at + 4)}${"•".repeat(12)}`;
}

/**
 * UX A7. Gym name and TV language are saved together; the TV link is shown masked and can be
 * copied or opened; rotating the key asks for confirmation because every TV using the old link
 * stops on its next refresh.
 */
export function SettingsManager({ initial }: { initial: AdminSettings }) {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const errors = useTranslations("errors");
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState(initial);
  const [gymName, setGymName] = useState(initial.gym_name);
  const [tvLocale, setTvLocale] = useState<Locale>(initial.tv_locale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);

  const dirty = gymName.trim() !== settings.gym_name || tvLocale !== settings.tv_locale;
  const nameError = gymName.trim().length === 0 ? t("gymNameRequired") : null;

  const errorText = (body: ApiError) => {
    const code = body.error?.code;
    return code && errors.has(code as never) ? errors(code as never) : errors("UNKNOWN");
  };

  async function save() {
    if (nameError || !dirty) return;
    setSaving(true);
    setError(null);
    const patch: Record<string, string> = {};
    if (gymName.trim() !== settings.gym_name) patch.gym_name = gymName.trim();
    if (tvLocale !== settings.tv_locale) patch.tv_locale = tvLocale;
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(errorText(body));
      setSettings(body as AdminSettings);
      setGymName((body as AdminSettings).gym_name);
      toast.show(t("toastSaved"));
      router.refresh();
    } catch {
      setError(errors("UNKNOWN"));
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    setRotating(true);
    setRotateError(null);
    try {
      const res = await fetch("/api/settings/tv-key", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setRotateError(errorText(body));
      setSettings(body as AdminSettings);
      setConfirmRotate(false);
      setShowKey(false);
      toast.show(t("toastRotated"));
    } catch {
      setRotateError(errors("UNKNOWN"));
    } finally {
      setRotating(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(settings.tv_url);
      toast.show(t("toastCopied"));
    } catch {
      setShowKey(true); // clipboard blocked: show the link so it can be copied by hand
    }
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("generalTitle")} />
          <form
            className="space-y-5 px-5 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <Field
              label={t("gymName")}
              hint={t("gymNameHint")}
              value={gymName}
              maxLength={80}
              onChange={(e) => setGymName(e.target.value)}
              error={gymName !== settings.gym_name ? nameError : null}
              required
            />
            <Segmented<Locale>
              label={t("tvLocale")}
              value={tvLocale}
              onChange={setTvLocale}
              options={[
                { value: "ar", label: NATIVE_NAME.ar },
                { value: "en", label: NATIVE_NAME.en },
              ]}
            />
            <p className="text-xs text-text-muted">{t("tvLocaleHint")}</p>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm font-semibold text-down">
                <AlertIcon size={18} />
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={saving} disabled={!dirty || !!nameError}>
                {c("save")}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardHeader title={t("tvTitle")} />
          <div className="space-y-5 px-5 py-5">
            <p className="text-sm text-text-muted">{t("tvBody")}</p>
            <div>
              <p className="mb-1.5 text-sm font-semibold">{t("tvLink")}</p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2">
                <TvIcon size={18} className="text-text-muted" />
                <code dir="ltr" className="min-w-0 flex-1 truncate text-start text-sm" data-testid="tv-url">
                  {showKey ? settings.tv_url : maskTvUrl(settings.tv_url)}
                </code>
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? t("hideKey") : t("showKey")}
                  className="grid size-11 shrink-0 place-items-center rounded-lg text-text-muted hover:bg-surface hover:text-text"
                >
                  {showKey ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-text-muted">{t("tvLinkHint")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void copy()}>
                <CopyIcon size={18} />
                {t("copy")}
              </Button>
              <ButtonLink variant="secondary" href={settings.tv_url} target="_blank" rel="noreferrer noopener">
                <ExternalIcon size={18} />
                {t("openTv")}
              </ButtonLink>
              <Button variant="danger" onClick={() => setConfirmRotate(true)}>
                <RefreshIcon size={18} />
                {t("rotate")}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog
        open={confirmRotate}
        onClose={() => !rotating && setConfirmRotate(false)}
        title={t("rotateTitle")}
        description={t("rotateBody")}
        closeLabel={c("close")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmRotate(false)} disabled={rotating}>
              {c("cancel")}
            </Button>
            <Button variant="danger" onClick={() => void rotate()} loading={rotating}>
              {t("rotateConfirm")}
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-1.5 ps-5 text-sm text-text-muted">
          <li>{t("rotateEffectOld")}</li>
          <li>{t("rotateEffectNew")}</li>
          <li>{t("rotateEffectAudit")}</li>
        </ul>
        {rotateError && (
          <p role="alert" className="mt-4 flex items-center gap-2 text-sm font-semibold text-down">
            <AlertIcon size={18} />
            {rotateError}
          </p>
        )}
      </Dialog>
      <Toast message={toast.message} />
    </>
  );
}
