"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertIcon, CoachIcon, PencilIcon, PlusIcon, UserOffIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Toast, useToast } from "@/components/ui/toast";
import { initials } from "@/lib/initials";
import type { CoachListItem } from "@/modules/coaches/service";
import { CoachStatusDialog, CreateCoachDialog, RenameCoachDialog } from "./coach-dialogs";
import { NameText } from "@/components/name-text";

type DialogState = { kind: "create" } | { kind: "rename"; coach: CoachListItem } | { kind: "status"; coach: CoachListItem } | null;

export function CoachesManager({ coaches, membersAvailable }: { coaches: CoachListItem[]; membersAvailable: boolean }) {
  const t = useTranslations("coaches");
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const saved = (message: string) => {
    setDialog(null);
    toast.show(message);
    router.refresh();
  };
  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <PlusIcon size={18} />
      {t("new")}
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={coaches.length > 0 ? addButton : undefined} />
      {coaches.length === 0 ? (
        <Card>
          <EmptyState icon={<CoachIcon />} title={t("emptyTitle")} description={t("emptyBody")} action={addButton} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {coaches.map((c) => {
              // profile status and Auth sign-in block are shown together; a mismatch is flagged
              const mismatch = c.is_active === c.sign_in_blocked;
              return (
                <li key={c.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_auto]">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold ${c.is_active ? "bg-brand/15 text-brand-text" : "bg-surface-2 text-text-muted"}`}>
                      {initials(c.full_name)}
                    </span>
                    <div className="min-w-0">
                      <NameText as="p" className="text-base font-bold">{c.full_name}</NameText>
                      <p className="truncate text-sm text-text-muted" dir="ltr" style={{ textAlign: "start" }}>{c.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={c.is_active ? "success" : "neutral"}>{c.is_active ? t("status.active") : t("status.inactive")}</Badge>
                    <span className="text-text-muted">{t("activeClients", { count: c.active_clients })}</span>
                    {mismatch && (
                      <Badge tone="warning">
                        <AlertIcon size={14} />
                        {c.is_active ? t("mismatchBlocked") : t("mismatchNotBlocked")}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button variant="secondary" onClick={() => setDialog({ kind: "rename", coach: c })} aria-label={t("renameNamed", { name: c.full_name })}>
                      <PencilIcon size={18} />
                      {t("rename")}
                    </Button>
                    <Button
                      variant={c.is_active ? "danger" : "secondary"}
                      onClick={() => setDialog({ kind: "status", coach: c })}
                      aria-label={t(c.is_active ? "deactivateNamed" : !c.sign_in_blocked ? "completeNamed" : "reactivateNamed", { name: c.full_name })}
                    >
                      {c.is_active && <UserOffIcon size={18} />}
                      {c.is_active ? t("deactivate") : !c.sign_in_blocked ? t("complete") : t("reactivate")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {dialog?.kind === "create" && <CreateCoachDialog onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "rename" && <RenameCoachDialog coach={dialog.coach} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "status" && (
        <CoachStatusDialog coach={dialog.coach} membersAvailable={membersAvailable} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      <Toast message={toast.message} />
    </>
  );
}
