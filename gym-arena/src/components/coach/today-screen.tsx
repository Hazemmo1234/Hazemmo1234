"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { MemberFormDialog } from "@/components/members/member-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { inputClasses } from "@/components/ui/field";
import { ChevronIcon, MembersIcon, PlusIcon, SearchIcon } from "@/components/ui/icons";
import type { TodayOverview } from "@/modules/entries/service";
import { ActionToast, ActivityDots, MemberAvatar, SeasonBanner } from "./shared";

type Filter = "all" | "pending" | "done";

/** UX C2 Today — the coach's home during a busy session: find a client in one or two taps. */
export function TodayScreen({ data }: { data: TodayOverview }) {
  const t = useTranslations("coach.today");
  const tm = useTranslations("members");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const { context, summary } = data;

  const members = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.members.filter((m) => {
      if (filter === "pending" && m.last_activity_at !== null) return false;
      if (filter === "done" && m.last_activity_at === null) return false;
      return !q || m.full_name.toLowerCase().includes(q) || m.member_code.toLowerCase().includes(q);
    });
  }, [data.members, query, filter]);

  const stats = [
    { label: t("statClients"), value: summary.members },
    { label: t("statActive"), value: summary.active_today },
    { label: t("statEntries"), value: summary.entries_today },
    { label: t("statAttended"), value: summary.attended_today },
  ];

  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-6">
      <SeasonBanner current={context.current} next={context.next} closed={context.closed} />

      <dl className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-surface px-2 py-3 text-center">
            <dd className="text-2xl font-extrabold tabular">{s.value}</dd>
            <dt className="mt-0.5 text-[11px] leading-tight text-text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      {data.members.length > 0 && (
        <div className="space-y-3">
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <SearchIcon className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} className={`${inputClasses} ps-11`} />
          </label>
          <div role="radiogroup" aria-label={t("filter")} className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface-2 p-1">
            {(["all", "pending", "done"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-11 rounded-lg px-2 text-sm font-semibold transition-colors ${filter === f ? "bg-brand text-white" : "text-text-muted hover:text-text"}`}
              >
                {t(`filter_${f}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {data.members.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <EmptyState
            icon={<MembersIcon />}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            action={<Button onClick={() => setAdding(true)}><PlusIcon size={18} />{t("addClient")}</Button>}
          />
        </div>
      ) : members.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">{t("noResults")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60 active:bg-surface-2">
                <MemberAvatar name={m.full_name} url={m.photo_url} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold"><bdi>{m.full_name}</bdi></span>
                    {context.current && m.card.is_rookie && <Badge tone="warning">{tm("rookie")}</Badge>}
                  </span>
                  <span className="mt-1.5 flex items-center gap-3">
                    <ActivityDots card={m.card} />
                    {m.last_activity_at !== null && <span className="text-xs font-semibold text-up">{t("loggedToday")}</span>}
                  </span>
                </span>
                {context.current && context.current.type === "championship" && (
                  <span className="shrink-0 text-end">
                    <span className="block text-xl font-extrabold tabular">{m.card.total_display}</span>
                    <span className="block text-[11px] text-text-muted">{t("points")}</span>
                  </span>
                )}
                <ChevronIcon size={18} className="shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.members.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="fixed bottom-24 end-4 z-30 flex min-h-14 items-center gap-2 rounded-2xl bg-brand px-5 font-bold text-white shadow-2xl hover:bg-brand-hover md:bottom-8 md:end-8"
        >
          <PlusIcon size={20} />
          {t("addClient")}
        </button>
      )}

      {adding && (
        <MemberFormDialog
          showCoach={false}
          coaches={[]}
          planEnabled={!!context.current}
          onClose={() => setAdding(false)}
          onSaved={(message) => {
            setAdding(false);
            setToast({ message });
            router.refresh();
          }}
        />
      )}
      <ActionToast toast={toast} onDone={clearToast} />
    </main>
  );
}
