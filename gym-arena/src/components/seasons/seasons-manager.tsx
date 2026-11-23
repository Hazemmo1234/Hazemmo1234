"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarIcon, LockIcon, PencilIcon, PlusIcon, TrophyIcon, TvIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Toast, useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/config";
import { formatDateRange, formatNumber } from "@/lib/i18n/format";
import type { IsoDate } from "@/lib/time";
import type { SeasonListItem } from "@/modules/seasons/service";
import type { SeasonStatus } from "@/modules/seasons/status";
import { CloseSeasonDialog, RevealDialog } from "./lifecycle-dialogs";
import { SeasonDialog, type EditableSeason } from "./season-dialog";

const STATUS_TONE: Record<SeasonStatus, BadgeTone> = { active: "success", scheduled: "brand", ended: "warning", closed: "neutral" };

export function SeasonsManager({
  seasons,
  today,
  suggestion,
  locale,
}: {
  seasons: SeasonListItem[];
  today: IsoDate;
  suggestion: { startsOn: IsoDate; endsOn: IsoDate };
  locale: Locale;
}) {
  const t = useTranslations("seasons");
  const current = useLocale() as Locale;
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ kind: "create" } | { kind: "edit"; season: EditableSeason } | null>(null);
  const [lifecycle, setLifecycle] = useState<{ kind: "close" | "reveal"; season: SeasonListItem } | null>(null);

  const saved = (message: string) => {
    setDialog(null);
    setLifecycle(null);
    toast.show(message);
    router.refresh(); // reload the list from the server
  };

  const newButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <PlusIcon size={18} />
      {t("new")}
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={seasons.length > 0 ? newButton : undefined} />

      {seasons.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarIcon />} title={t("emptyTitle")} description={t("emptyBody")} action={newButton} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {seasons.map((s) => (
              <li key={s.id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[s.status]}>
                      {s.status === "active" && <span className="size-1.5 rounded-full bg-up" />}
                      {t(`status.${s.status}`)}
                    </Badge>
                    <Badge tone={s.type === "preseason" ? "warning" : "neutral"}>{t(`typeLabel.${s.type}`)}</Badge>
                  </div>
                  <p className="truncate text-base font-bold">
                    <bdi>{s.name}</bdi>
                  </p>
                  <p className="mt-0.5 text-sm text-text-muted lg:hidden">{formatDateRange(s.starts_on, s.ends_on, current ?? locale)}</p>
                </div>
                <div className="hidden text-sm lg:block">
                  <p>{formatDateRange(s.starts_on, s.ends_on, current ?? locale)}</p>
                  <p className="mt-0.5 text-text-muted">
                    {s.status === "active" && t("daysLeft", { count: s.days })}
                    {s.status === "scheduled" && t("startsIn", { count: s.days })}
                    {s.status === "ended" && t("awaitingCloseHint")}
                    {s.status === "closed" && t("closedHint")}
                    {" · "}
                    {t("participants", { count: s.participants, n: formatNumber(s.participants, current ?? locale, 0) })}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <p className="text-sm text-text-muted lg:hidden">
                    {s.status === "active" && t("daysLeft", { count: s.days })}
                    {s.status === "scheduled" && t("startsIn", { count: s.days })}
                    {s.status === "ended" && t("awaitingCloseHint")}
                    {s.status === "closed" && t("closedHint")}
                  </p>
                  {s.status === "closed" ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="inline-flex min-h-11 items-center gap-2 px-2 text-sm text-text-muted">
                        <LockIcon size={18} />
                        {t("readOnly")}
                      </span>
                      {s.type === "championship" && (
                        <>
                          <ButtonLink variant="secondary" href={`/admin/seasons/${s.id}`} aria-label={t("resultsNamed", { name: s.name })}>
                            <TrophyIcon size={18} />
                            {t("results")}
                          </ButtonLink>
                          <Button onClick={() => setLifecycle({ kind: "reveal", season: s })} aria-label={t("revealNamed", { name: s.name })}>
                            <TvIcon size={18} />
                            {s.reveal_started_at ? t("revealAgain") : t("reveal")}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {s.status === "ended" && (
                        <Button variant="danger" onClick={() => setLifecycle({ kind: "close", season: s })} aria-label={t("closeNamed", { name: s.name })}>
                          <LockIcon size={18} />
                          {t("close")}
                        </Button>
                      )}
                      <Button variant="secondary" onClick={() => setDialog({ kind: "edit", season: s })} aria-label={t("editNamed", { name: s.name })}>
                        <PencilIcon size={18} />
                        {t("edit")}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {dialog && (
        <SeasonDialog
          mode={dialog.kind === "create" ? { kind: "create", suggestion } : { kind: "edit", season: dialog.season }}
          today={today}
          locale={current ?? locale}
          onClose={() => setDialog(null)}
          onSaved={saved}
        />
      )}
      {lifecycle?.kind === "close" && <CloseSeasonDialog season={lifecycle.season} onClose={() => setLifecycle(null)} onDone={saved} />}
      {lifecycle?.kind === "reveal" && <RevealDialog season={lifecycle.season} onClose={() => setLifecycle(null)} onDone={saved} />}
      <Toast message={toast.message} />
    </>
  );
}
