"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, SelectField } from "@/components/ui/field";
import { AuditIcon, ChevronIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/config";
import { APP_TIMEZONE } from "@/lib/time";
import { formatNumber } from "@/lib/i18n/format";
import { AUDIT_ACTIONS, type AuditAction } from "@/modules/audit/present";
import type { AuditPage } from "@/modules/audit/service";

export interface AuditFilterState {
  action: AuditAction | "";
  actor_id: string;
  from: string;
  to: string;
  page: number;
}

const TONE: Record<string, BadgeTone> = {
  "entry.edit": "warning",
  "entry.void": "danger",
  "season.close": "brand",
  "season.reveal": "brand",
  "tv_key.regenerate": "danger",
  "member.deactivate": "danger",
  "coach.deactivate": "danger",
};

const INTL: Record<Locale, string> = { ar: "ar-EG-u-nu-latn", en: "en-GB" };

function when(iso: string, locale: Locale) {
  return new Intl.DateTimeFormat(INTL[locale], { timeZone: APP_TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** UX A6 — read-only, newest first; each row: when, who, what, on whom, the reason and the changes. */
export function AuditLog({ filters, page, staff }: { filters: AuditFilterState; page: AuditPage; staff: Array<{ id: string; full_name: string }> }) {
  const t = useTranslations("audit");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const label = (action: string) => {
    const key = `actions.${action.replace(".", "_")}`;
    return t.has(key as never) ? t(key as never) : action;
  };
  const field = (f: string) => (t.has(`fields.${f}` as never) ? t(`fields.${f}` as never) : f);

  const go = (next: Partial<AuditFilterState>) => {
    const merged = { ...filters, page: 1, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "page" && v === 1)) params.set(k, String(v));
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label={t("filterAction")} value={filters.action} onChange={(e) => go({ action: e.target.value as AuditAction | "" })}>
            <option value="">{t("allActions")}</option>
            {AUDIT_ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </SelectField>
          <SelectField label={t("filterActor")} value={filters.actor_id} onChange={(e) => go({ actor_id: e.target.value })}>
            <option value="">{t("allActors")}</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </SelectField>
          <Field label={t("from")} type="date" dir="ltr" value={filters.from} max={filters.to || undefined} onChange={(e) => go({ from: e.target.value })} />
          <Field label={t("to")} type="date" dir="ltr" value={filters.to} min={filters.from || undefined} onChange={(e) => go({ to: e.target.value })} />
        </div>
      </Card>

      {page.rows.length === 0 ? (
        <Card><EmptyState icon={<AuditIcon />} title={t("emptyTitle")} description={t("emptyBody")} /></Card>
      ) : (
        <Card className="overflow-hidden">
          <p className="border-b border-border px-5 py-3 text-sm text-text-muted">{t("count", { count: page.total, n: formatNumber(page.total, locale, 0) })}</p>
          <ol className="divide-y divide-border">
            {page.rows.map((r) => (
              <li key={r.id} className="grid gap-2 px-5 py-4 lg:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-6">
                <div className="text-sm text-text-muted">
                  <time dateTime={r.created_at}>{when(r.created_at, locale)}</time>
                  <p className="font-semibold text-text"><bdi>{r.actor_name ?? t("system")}</bdi></p>
                </div>
                <div className="min-w-0">
                  <Badge tone={TONE[r.action] ?? "neutral"}>{label(r.action)}</Badge>
                  {r.target && <p className="mt-1 truncate font-bold"><bdi>{r.target}</bdi></p>}
                  {r.reason && <p className="mt-1 text-sm"><span className="text-text-muted">{`${t("reason")}: `}</span><bdi>{r.reason}</bdi></p>}
                </div>
                <div className="min-w-0 text-sm">
                  {r.changes.length === 0 ? (
                    <p className="text-text-muted">{r.action === "tv_key.regenerate" ? t("keyNotLogged") : "—"}</p>
                  ) : (
                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                      {r.changes.map((c) => (
                        <div key={c.field} className="contents">
                          <dt className="text-text-muted">{field(c.field)}</dt>
                          <dd className="min-w-0 truncate" dir="auto">
                            {c.before !== null && <><span className="text-text-muted line-through"><bdi>{c.before}</bdi></span>{" → "}</>}
                            <span className="font-semibold"><bdi>{c.after ?? "—"}</bdi></span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {page.pages > 1 && (
            <nav className="flex items-center justify-between border-t border-border px-5 py-3" aria-label={t("pagination")}>
              <Button variant="secondary" disabled={page.page <= 1} onClick={() => go({ page: page.page - 1 })}>
                <ChevronIcon size={18} className="-scale-x-100 rtl:scale-x-100" />
                {t("previous")}
              </Button>
              <span className="text-sm text-text-muted">{t("pageOf", { page: formatNumber(page.page, locale, 0), pages: formatNumber(page.pages, locale, 0) })}</span>
              <Button variant="secondary" disabled={page.page >= page.pages} onClick={() => go({ page: page.page + 1 })}>
                {t("next")}
                <ChevronIcon size={18} />
              </Button>
            </nav>
          )}
        </Card>
      )}
    </>
  );
}
