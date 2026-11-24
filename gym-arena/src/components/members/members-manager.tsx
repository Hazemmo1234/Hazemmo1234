"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClasses, Segmented } from "@/components/ui/field";
import { ChevronIcon, FilterIcon, MembersIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Toast, useToast } from "@/components/ui/toast";
import type { Locale } from "@/i18n/config";
import { initials } from "@/lib/initials";
import { formatEgyptianMobile } from "@/lib/phone";
import { formatNumber } from "@/lib/i18n/format";
import type { Standing } from "@/modules/leaderboard/board";
import type { MemberDetail, MemberListItem } from "@/modules/members/service";
import { MemberDetailDialog, MemberStatusDialog, ReassignDialog } from "./member-dialogs";
import { MemberFormDialog } from "./member-form";
import { NameText } from "@/components/name-text";

export interface MemberFilters {
  q: string;
  coach: string;
  status: "all" | "active" | "inactive";
  rookie: boolean;
}
type Coach = { id: string; full_name: string; is_active: boolean };
type DialogState =
  | { kind: "create" }
  | { kind: "detail"; member: MemberDetail }
  | { kind: "edit"; member: MemberDetail }
  | { kind: "reassign"; member: MemberDetail }
  | { kind: "status"; member: MemberDetail }
  | null;

function Avatar({ name, url, size = "size-11" }: { name: string; url: string | null; size?: string }) {
  return (
    <span className={`${size} grid shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-sm font-bold text-text-muted`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
      {url ? <img src={url} alt="" className="size-full object-cover" /> : initials(name)}
    </span>
  );
}

export function MembersManager({
  members,
  coaches,
  filters,
  hasActiveSeason,
  standings = {},
  standingsFailed = false,
  locale,
}: {
  members: MemberListItem[];
  coaches: Coach[];
  filters: MemberFilters;
  hasActiveSeason: boolean;
  /** rank / total per member id for the active season (UX A3) */
  standings?: Record<string, Standing>;
  standingsFailed?: boolean;
  locale: Locale;
}) {
  const t = useTranslations("members");
  const n = (x: number) => formatNumber(x, locale, 0);
  // rookies rank on their own list (BR-R2) — say so instead of a bare number
  const rankText = (st: Standing) => (st.list === "rookies" ? t("rookieRank", { rank: n(st.rank) }) : n(st.rank));
  const te = useTranslations("errors");
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [search, setSearch] = useState(filters.q);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = (filters.coach ? 1 : 0) + (filters.status !== "all" ? 1 : 0) + (filters.rookie ? 1 : 0);
  const [pending, startTransition] = useTransition();
  const activeCoaches = useMemo(() => coaches.filter((c) => c.is_active).map(({ id, full_name }) => ({ id, full_name })), [coaches]);

  const applyFilters = (next: Partial<MemberFilters>) => {
    const f = { ...filters, ...next };
    const params = new URLSearchParams();
    if (f.q) params.set("q", f.q);
    if (f.coach) params.set("coach", f.coach);
    if (f.status !== "all") params.set("status", f.status);
    if (f.rookie) params.set("rookie", "1");
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
  };

  // debounced search → URL
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => applyFilters({ q: search.trim() }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyFilters is recreated each render
  }, [search]);

  async function openMember(id: string, then: (m: MemberDetail) => DialogState = (m) => ({ kind: "detail", member: m })) {
    setOpening(id);
    setOpenError(null);
    try {
      const res = await fetch(`/api/members/${id}`);
      if (!res.ok) throw new Error();
      setDialog(then(((await res.json()) as { member: MemberDetail }).member));
    } catch {
      setOpenError(te("UNKNOWN"));
    } finally {
      setOpening(null);
    }
  }

  const saved = (message: string) => {
    setDialog(null);
    toast.show(message);
    router.refresh();
  };
  const filtering = !!(filters.q || filters.coach || filters.status !== "all" || filters.rookie);
  const addButton = (
    <Button onClick={() => setDialog({ kind: "create" })}>
      <PlusIcon size={18} />
      {t("new")}
    </Button>
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("description", { count: members.length })} actions={addButton} />
      {standingsFailed && <p role="status" className="mb-4 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-semibold">{t("rankUnavailable")}</p>}

      {/* iPad landscape: search + coach on the first row, status + rookies on the second, so the
          search keeps its full placeholder; one row from 1280 px up */}
      <Card className="mb-4 grid gap-3 p-4 lg:grid-cols-2 lg:items-end xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        <div className="flex gap-2">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">{t("search")}</span>
            <SearchIcon className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("searchPlaceholder")} className={`${inputClasses} ps-11`} />
          </label>
          {/* phones: coach / status / rookie filters fold behind one button so the list starts on the first screen */}
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="member-filters"
            onClick={() => setFiltersOpen((o) => !o)}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors md:hidden ${activeFilterCount > 0 ? "border-brand/40 bg-brand/15 text-brand-text" : "border-border bg-surface-2 text-text"}`}
          >
            <FilterIcon size={18} />
            {activeFilterCount > 0 ? t("filtersCount", { count: activeFilterCount }) : t("filters")}
          </button>
        </div>
        <div id="member-filters" className={`${filtersOpen ? "grid" : "hidden"} gap-3 md:contents`}>
        <select aria-label={t("filterCoach")} value={filters.coach} onChange={(e) => applyFilters({ coach: e.target.value })} className={`${inputClasses} appearance-auto`}>
          <option value="">{t("allCoaches")}</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>{c.is_active ? c.full_name : `${c.full_name} (${t("status.inactive")})`}</option>
          ))}
        </select>
        <div className="flex flex-wrap items-end gap-3 lg:col-span-2 xl:col-span-1">
          <div className="min-w-56 flex-1">
            <Segmented
              label={<span className="sr-only">{t("filterStatus")}</span>}
              value={filters.status}
              onChange={(status) => applyFilters({ status })}
              options={[
                { value: "all", label: t("statusAll") },
                { value: "active", label: t("status.active") },
                { value: "inactive", label: t("status.inactive") },
              ]}
            />
          </div>
          {hasActiveSeason && (
            <button
              type="button"
              aria-pressed={filters.rookie}
              onClick={() => applyFilters({ rookie: !filters.rookie })}
              className={`min-h-11 rounded-xl border px-4 text-sm font-semibold transition-colors ${filters.rookie ? "border-gold/40 bg-gold/15 text-gold" : "border-border bg-surface-2 text-text-muted hover:text-text"}`}
            >
              {t("rookiesOnly")}
            </button>
          )}
        </div>
        </div>
      </Card>

      {openError && <p role="alert" className="mb-3 rounded-xl border border-down/30 bg-down/10 px-4 py-3 text-sm font-semibold text-down">{openError}</p>}

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {members.length === 0 ? (
          <Card>
            {filtering ? (
              <EmptyState icon={<SearchIcon />} title={t("noResultsTitle")} description={t("noResultsBody")}
                action={<Button variant="secondary" onClick={() => { setSearch(""); applyFilters({ q: "", coach: "", status: "all", rookie: false }); }}>{t("clearFilters")}</Button>} />
            ) : (
              <EmptyState icon={<MembersIcon />} title={t("emptyTitle")} description={t("emptyBody")} action={addButton} />
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="hidden gap-x-3 border-b border-border px-5 py-3 text-xs font-semibold text-text-muted lg:grid lg:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1fr)_5.5rem_5rem_4rem_1.25rem] xl:grid-cols-[6.5rem_minmax(0,2fr)_7rem_minmax(0,1fr)_5.5rem_5rem_4rem_1.25rem]">
              <span className="hidden xl:block">{t("code")}</span>
              <span>{t("member")}</span>
              <span>{t("phone")}</span>
              <span>{t("coach")}</span>
              <span>{t("statusLabel")}</span>
              <span>{t("rank")}</span>
              <span className="text-end">{t("total")}</span>
              <span />
            </div>
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => openMember(m.id)}
                    aria-label={t("openNamed", { name: m.full_name })}
                    disabled={opening === m.id}
                    className="grid w-full items-center gap-x-3 gap-y-2 px-5 py-4 text-start transition-colors hover:bg-surface-2/60 disabled:opacity-60 grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1fr)_5.5rem_5rem_4rem_1.25rem] xl:grid-cols-[6.5rem_minmax(0,2fr)_7rem_minmax(0,1fr)_5.5rem_5rem_4rem_1.25rem]"
                  >
                    <span dir="ltr" className="hidden text-sm tabular text-text-muted xl:block rtl:text-end">{m.member_code}</span>
                    <span className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
                      <Avatar name={m.full_name} url={m.photo_url} />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <NameText className="font-bold">{m.full_name}</NameText>
                          {m.is_rookie && <Badge tone="warning">{t("rookie")}</Badge>}
                        </span>
                        {/* iPad landscape: the code moves under the name so the name gets the width */}
                        <span dir="ltr" className="hidden text-xs tabular text-text-muted lg:block xl:hidden rtl:text-end">{m.member_code}</span>
                        <span className="block truncate text-xs text-text-muted lg:hidden">
                          <span dir="ltr">{m.member_code}</span>{" · "}<bdi>{m.coach_name ?? "—"}</bdi>
                          {standings[m.id] && <>{" · "}{rankText(standings[m.id])}{" · "}{t("points", { total: n(standings[m.id].total_display) })}</>}
                        </span>
                      </span>
                    </span>
                    <span dir="ltr" className="hidden whitespace-nowrap text-sm tabular lg:block rtl:text-end">{formatEgyptianMobile(m.phone)}</span>
                    <NameText className="hidden text-sm lg:block">{m.coach_name ?? "—"}</NameText>
                    <span className="justify-self-end lg:justify-self-start">
                      <Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status === "active" ? t("status.active") : t("status.inactive")}</Badge>
                    </span>
                    <span data-testid="member-rank" className="hidden text-sm tabular lg:block">{standings[m.id] ? rankText(standings[m.id]) : "—"}</span>
                    <span data-testid="member-total" className="hidden text-end text-sm font-bold tabular lg:block">{standings[m.id] ? n(standings[m.id].total_display) : "—"}</span>
                    <ChevronIcon className="hidden justify-self-end text-text-muted lg:block" size={18} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {dialog?.kind === "create" && (
        <MemberFormDialog showCoach coaches={activeCoaches} defaultCoachId={filters.coach && activeCoaches.some((c) => c.id === filters.coach) ? filters.coach : undefined} planEnabled={hasActiveSeason} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "detail" && (
        <MemberDetailDialog
          member={dialog.member}
          locale={locale}
          onClose={() => setDialog(null)}
          onEdit={() => setDialog({ kind: "edit", member: dialog.member })}
          onReassign={() => setDialog({ kind: "reassign", member: dialog.member })}
          onStatus={() => setDialog({ kind: "status", member: dialog.member })}
        />
      )}
      {dialog?.kind === "edit" && (
        <MemberFormDialog member={dialog.member} showCoach={false} coaches={activeCoaches} planEnabled={hasActiveSeason} onClose={() => setDialog(null)} onSaved={saved} />
      )}
      {dialog?.kind === "reassign" && <ReassignDialog member={dialog.member} coaches={activeCoaches} onClose={() => setDialog(null)} onSaved={saved} />}
      {dialog?.kind === "status" && <MemberStatusDialog member={dialog.member} coaches={activeCoaches} onClose={() => setDialog(null)} onSaved={saved} />}
      <Toast message={toast.message} />
    </>
  );
}
