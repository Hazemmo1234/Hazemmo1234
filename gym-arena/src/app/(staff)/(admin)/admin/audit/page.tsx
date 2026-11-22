import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuditLog, type AuditFilterState } from "@/components/audit/audit-log";
import { createClient } from "@/lib/supabase/server";
import { isIsoDate } from "@/lib/time";
import { isAuditAction } from "@/modules/audit/present";
import { listAudit } from "@/modules/audit/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UX A6 Audit log — chronological (newest first), filter by action / actor / Cairo dates. Read-only.
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filters: AuditFilterState = {
    action: isAuditAction(sp.action) ? sp.action : "",
    actor_id: sp.actor_id && GUID.test(sp.actor_id) ? sp.actor_id : "",
    from: sp.from && isIsoDate(sp.from) ? sp.from : "",
    to: sp.to && isIsoDate(sp.to) ? sp.to : "",
    page: Math.max(1, Math.min(10_000, Number.parseInt(sp.page ?? "1", 10) || 1)),
  };
  const supabase = await createClient();
  const [page, staff] = await Promise.all([
    listAudit(supabase, {
      action: filters.action || undefined,
      actor_id: filters.actor_id || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page: filters.page,
    }),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  return <AuditLog filters={filters} page={page} staff={(staff.data ?? []) as Array<{ id: string; full_name: string }>} />;
}
