import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { isNavReady } from "@/components/admin/nav-items";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberAvatar } from "@/components/coach/shared";
import { ActivityIcon, AlertIcon, CalendarIcon, ChevronIcon, CoachIcon, MembersIcon, TrophyIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import type { Locale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/categories";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time";
import { getAdminOverview, type AdminOverview } from "@/modules/dashboard/overview";
import { topOf } from "@/modules/leaderboard/board";
import { dashboardBoard, type DashboardBoard } from "@/modules/leaderboard/service";
import { NameText } from "@/components/name-text";

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

/**
 * UX A1 ranking cards for the running season, from ONE season computation (modules/leaderboard,
 * the same ranking as the TV and the coach board — AC-20). Activity window (D32): the
 * last 7 Cairo calendar days, today included — today − 6 … today; labelled "last 7 days".
 * A failure here never takes the rest of the dashboard down.
 */
async function loadBoard(o: AdminOverview, adminId: string): Promise<DashboardBoard | "failed" | null> {
  if (!o.current) return null;
  const { id, name, type, starts_on, ends_on } = o.current;
  try {
    return await dashboardBoard({ id, name, type, starts_on, ends_on }, { id: adminId, role: "admin" }, o.today, addDays(o.today, -6));
  } catch {
    return "failed";
  }
}

async function BoardCards({ board, locale }: { board: DashboardBoard; locale: Locale }) {
  const t = await getTranslations("dashboard");
  const n = (x: number) => formatNumber(x, locale, 0);
  const { activity } = board;
  const pct = activity.activeParticipants ? Math.round((activity.activeLast7Days / activity.activeParticipants) * 100) : 0;
  const top = topOf(board.board, 5);
  const preseason = board.board.season.type === "preseason";
  const maxEntries = Math.max(1, ...CATEGORY_ORDER.map((c) => activity.entriesPerCategory[c]));
  return (
    <div className="mt-6 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat icon={<TrophyIcon />} label={t("newBests")} value={n(board.newBests)} hint={t("newBestsHint")} />
        <Stat
          icon={<ActivityIcon />}
          label={t("activeLast7Days")}
          value={`${n(pct)}%`}
          hint={t("activeLast7DaysHint", { active: n(activity.activeLast7Days), total: n(activity.activeParticipants) })}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("top5")}</h2>
          {preseason ? (
            <p className="text-sm text-text-muted">{t("preseasonBoard")}</p>
          ) : top.rows.length === 0 ? (
            <p className="text-sm text-text-muted">{t("top5Empty")}</p>
          ) : (
            <>
              <ol data-testid="top5" className="divide-y divide-border">
                {top.rows.map((r, i) => (
                  <li key={`${r.member_id}-${i}`} className="flex min-h-14 items-center gap-3 py-2">
                    <span className={`display tabular w-8 shrink-0 text-center text-xl ${r.rank <= 3 ? "text-gold" : "text-text-muted"}`}>{n(r.rank)}</span>
                    <MemberAvatar name={r.full_name} url={r.photo_url} size="size-10" />
                    <span className="min-w-0 flex-1">
                      <NameText className="block font-bold">{r.full_name}</NameText>
                      {r.coach_name && <NameText className="block text-xs text-text-muted">{r.coach_name}</NameText>}
                    </span>
                    <span className="shrink-0 text-end">
                      <span className="display tabular block text-xl leading-none">{n(r.total_display)}</span>
                      <span className="text-xs text-text-muted">{t("pts")}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {top.moreTied > 0 && <p className="mt-2 text-sm font-semibold text-text-muted">{t("moreTied", { count: top.moreTied })}</p>}
            </>
          )}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-bold">{t("entriesPerCategory")}</h2>
          <ul data-testid="per-category" className="space-y-3">
            {CATEGORY_ORDER.map((c) => {
              const v = activity.entriesPerCategory[c];
              return (
                <li key={c} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm">
                  <span dir="ltr" className="truncate text-start font-semibold">{CATEGORY_LABEL[c]}</span>
                  <span className="h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${(v / maxEntries) * 100}%` }} />
                  </span>
                  <span className="tabular text-end font-bold">{n(v)}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [locale, t, profile] = await Promise.all([getLocale(), getTranslations("dashboard"), getCurrentProfile()]);
  const o = await getAdminOverview(await createClient());
  const board = await loadBoard(o, profile!.id);
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

      {/* three stats → three columns from iPad portrait up (two columns left an empty cell) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<MembersIcon />} label={t("activeMembers")} value={n(o.activeMembers)} />
        <Stat icon={<ActivityIcon />} label={t("entriesToday")} value={n(o.entriesToday)} />
        <Stat
          icon={<CoachIcon />}
          label={t("coachesLoggedToday")}
          value={`${n(o.coachesLoggedToday)} / ${n(o.activeCoaches)}`}
          hint={t("coachesLoggedTodayHint")}
        />
      </div>

      {board === "failed" ? (
        <div className="mt-6"><Alert>{t("boardError")}</Alert></div>
      ) : board ? (
        <BoardCards board={board} locale={locale as Locale} />
      ) : null}
    </>
  );
}
