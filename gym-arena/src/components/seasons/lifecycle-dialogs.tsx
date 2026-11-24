"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useApiErrorText, type ApiError } from "@/components/coach/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AlertIcon, TrophyIcon } from "@/components/ui/icons";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/lib/i18n/format";
import type { ClosePreview } from "@/modules/seasons/lifecycle";
import type { SeasonListItem } from "@/modules/seasons/service";
import { NameText } from "@/components/name-text";

async function call<T>(method: "GET" | "POST", url: string): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const res = await fetch(url, { method });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, error: (json as { error?: ApiError } | null)?.error ?? {} };
  } catch {
    return { ok: false, error: { code: "NETWORK" } };
  }
}

const PLACE = ["", "text-gold", "text-silver", "text-bronze"];

/**
 * UX A2 Close (only when ended): a confirmation with the summary of the final top 3; for a
 * preseason "baselines will be frozen" (BR-S10). The close itself recomputes everything on the
 * server in one transaction (D21) — the preview is shown, never sent back.
 */
export function CloseSeasonDialog({ season, onClose, onDone }: { season: SeasonListItem; onClose: () => void; onDone: (message: string) => void }) {
  const t = useTranslations("lifecycle");
  const c = useTranslations("common");
  const locale = useLocale() as Locale;
  const errorText = useApiErrorText();
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState(false);
  const preseason = season.type === "preseason";

  useEffect(() => {
    let live = true;
    void call<ClosePreview>("GET", `/api/seasons/${season.id}/close`).then((r) => {
      if (!live) return;
      if (r.ok) setPreview(r.data);
      else setLoadError(errorText(r.error));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per dialog
  }, [season.id]);

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await call<{ results: number }>("POST", `/api/seasons/${season.id}/close`);
    setBusy(false);
    if (!r.ok) {
      setError(r.error.reason === "close_not_configured" ? t("notConfigured") : r.error.reason === "not_ended" ? t("notEnded") : errorText(r.error));
      return;
    }
    onDone(preseason ? t("toastPreseasonClosed") : t("toastClosed", { count: r.data.results, n: formatNumber(r.data.results, locale, 0) }));
  }

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={preseason ? t("closePreseasonTitle") : t("closeTitle")}
      description={<bdi>{season.name}</bdi>}
      closeLabel={c("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{c("cancel")}</Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} disabled={!preview?.can_close || !typed}>
            {preseason ? t("closePreseasonConfirm") : t("closeConfirm")}
          </Button>
        </>
      }
    >
      {!preview && !loadError && <div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}
      {loadError && <p role="alert" className="text-sm font-semibold text-down">{loadError}</p>}
      {preview && (
        <div className="space-y-4 text-sm">
          {preseason ? (
            <ul className="list-disc space-y-1.5 ps-5 text-text-muted">
              <li>{t("preseasonFreeze", { n: formatNumber(preview.entries, locale, 0) })}</li>
              <li>{t("preseasonNoResults")}</li>
              <li>{t("preseasonBaselines")}</li>
            </ul>
          ) : (
            <>
              <div>
                <p className="mb-2 font-semibold">{t("top3Title")}</p>
                {preview.top3.length === 0 ? (
                  <p className="text-text-muted">{t("top3Empty")}</p>
                ) : (
                  <ol className="space-y-2">
                    {preview.top3.map((w, i) => (
                      <li key={i} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                        <TrophyIcon size={18} className={PLACE[w.rank] ?? "text-text-muted"} />
                        <span className={`w-6 font-extrabold tabular ${PLACE[w.rank] ?? ""}`}>{formatNumber(w.rank, locale, 0)}</span>
                        <NameText className="min-w-0 flex-1 font-bold">{w.full_name}</NameText>
                        <span className="font-extrabold tabular">{formatNumber(w.total, locale, 0)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <ul className="list-disc space-y-1.5 ps-5 text-text-muted">
                <li>{t("closeEffectResults", { n: formatNumber(preview.participants, locale, 0) })}</li>
                {preview.unranked > 0 && <li>{t("closeEffectInactive", { n: formatNumber(preview.unranked, locale, 0) })}</li>}
                <li>{t("closeEffectFinal")}</li>
              </ul>
            </>
          )}
          {!preview.can_close && (
            <p role="alert" className="flex items-center gap-2 font-semibold text-down"><AlertIcon size={18} />{preview.blocked === "closed" ? t("alreadyClosed") : t("notEnded")}</p>
          )}
          {preview.can_close && (
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-down/30 bg-down/10 px-4 py-3">
              <input type="checkbox" checked={typed} onChange={(e) => setTyped(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-brand" />
              <span className="font-semibold">{preseason ? t("confirmPreseasonCheck") : t("confirmCheck")}</span>
            </label>
          )}
          {error && <p role="alert" className="flex items-center gap-2 font-semibold text-down"><AlertIcon size={18} />{error}</p>}
        </div>
      )}
    </Dialog>
  );
}

/** UX A2 Start reveal (closed championships only — BR-S8): the TV runs the reveal sequence. */
export function RevealDialog({ season, onClose, onDone }: { season: SeasonListItem; onClose: () => void; onDone: (message: string) => void }) {
  const t = useTranslations("lifecycle");
  const c = useTranslations("common");
  const errorText = useApiErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const again = season.reveal_started_at !== null;
  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await call("POST", `/api/seasons/${season.id}/reveal`);
    setBusy(false);
    if (!r.ok) return setError(errorText(r.error));
    onDone(t("toastRevealStarted"));
  }
  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={again ? t("revealAgainTitle") : t("revealTitle")}
      description={<bdi>{season.name}</bdi>}
      closeLabel={c("close")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{c("cancel")}</Button>
          <Button onClick={() => void confirm()} loading={busy}>{again ? t("revealAgainConfirm") : t("revealConfirm")}</Button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 ps-5 text-sm text-text-muted">
        <li>{t("revealEffectTv")}</li>
        <li>{t("revealEffectSequence")}</li>
        <li>{t("revealEffectResume")}</li>
      </ul>
      {error && <p role="alert" className="mt-4 flex items-center gap-2 text-sm font-semibold text-down"><AlertIcon size={18} />{error}</p>}
    </Dialog>
  );
}
