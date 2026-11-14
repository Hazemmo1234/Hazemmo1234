import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { isNavReady } from "@/components/admin/nav-items";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityIcon, AlertIcon, CalendarIcon, ChevronIcon, CoachIcon, MembersIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { getAdminOverview } from "@/modules/dashboard/overview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-text-muted">{icon}</div>
      <div className="min-w-0">
        <p className="text-sm text-text-muted">{label}</p>
        <p className="display tabular mt-1 text-3xl leading-none">{value}</p>
        {hint && <p className="mt-2 text-xs text-text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

/** Names typed by the admin can be Latin inside Arabic text (or the reverse): isolate them. */
const isolate = (chunks: React.ReactNode) => <bdi>{chunks}</bdi>;

function Alert({ children, href, action }: { children: React.ReactNode; href?: string; action?: string }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm">
      <AlertIcon className="text-gold" />
      <p className="min-w-0 flex-1 font-semibold">{children}</p>
      {href && action && (
        <Link href={href} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-semibold text-gold hover:underline">
          {action}
          <ChevronIcon size={16} />
        </Link>
      )}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("dashboard")]);
  const o = await getAdminOverview(await createClient());
  const n = (x: number) => formatNumber(x, locale, 0);
  const seasonsHref = isNavReady("seasons") ? "/admin/seasons" : undefined;

  return (
    <>
      <PageHeader title={t("title")} description={formatDate(o.today, locale)} />

      <div className="mb-6 space-y-3">
        {o.awaitingClose && (
          <Alert href={seasonsHref} action={t("openSeasons")}>
            {t.rich("alertAwaitingClose", { name: o.awaitingClose.name, n: isolate })}
          </Alert>
        )}
        {!o.nextMonthCovered && <Alert href={seasonsHref} action={t("openSeasons")}>{t("alertNoNextSeason")}</Alert>}
      </div>

      <Card className="mb-6 overflow-hidden">
        {o.current ? (
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="success">
                  <span className="size-1.5 rounded-full bg-up" />
                  {t("live")}
                </Badge>
                <Badge tone={o.current.type === "preseason" ? "warning" : "brand"}>{t(`type.${o.current.type}`)}</Badge>
              </div>
              <h2 className="truncate text-2xl font-extrabold">
                <bdi>{o.current.name}</bdi>
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {formatDate(o.current.starts_on, locale)} — {formatDate(o.current.ends_on, locale)}
              </p>
              <p className="mt-4 text-sm text-text-muted">{t("participants", { count: o.current.participants })}</p>
            </div>
            <div className="rounded-2xl bg-surface-2 px-8 py-5 text-center">
              <p className="display tabular text-6xl leading-none text-brand-text">{n(o.current.daysLeft)}</p>
              <p className="mt-2 text-sm font-semibold text-text-muted">{t("daysLeft", { count: o.current.daysLeft })}</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<CalendarIcon />}
            title={t("noActiveSeason")}
            description={
              o.next
                ? t.rich("nextStarts", { name: o.next.name, date: formatDate(o.next.starts_on, locale), count: o.next.daysUntil, n: isolate })
                : t("noSeasonScheduled")
            }
          />
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={<MembersIcon />} label={t("activeMembers")} value={n(o.activeMembers)} />
        <Stat icon={<ActivityIcon />} label={t("entriesToday")} value={n(o.entriesToday)} />
        <Stat
          icon={<CoachIcon />}
          label={t("coachesLoggedToday")}
          value={`${n(o.coachesLoggedToday)} / ${n(o.activeCoaches)}`}
          hint={t("coachesLoggedTodayHint")}
        />
      </div>
    </>
  );
}
