import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "@/lib/supabase/fetch-all";
import { addDays, cairoMidnight } from "@/lib/time";
import { auditChanges, auditMemberId, type AuditAction, type AuditChange } from "./present";

/**
 * GET /api/audit and the A6 screen. Read with the ADMIN's own client: RLS limits audit_log to
 * admins; rows are immutable in the database (no update/delete for anyone), and this module
 * only reads. Names for actors and targets are resolved with the same client.
 */
export const AUDIT_PAGE_SIZE = 50;

export interface AuditFilters {
  action?: AuditAction;
  actor_id?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface AuditRow {
  id: number;
  created_at: string;
  action: string;
  actor_name: string | null;
  entity_type: string;
  /** a readable target: member, season or coach name — never an id or a phone */
  target: string | null;
  reason: string | null;
  changes: AuditChange[];
}

export interface AuditPage {
  rows: AuditRow[];
  page: number;
  pages: number;
  total: number;
}

type Raw = {
  id: number;
  created_at: string;
  action: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
};

async function namesOf(client: SupabaseClient, table: "profiles" | "members" | "seasons", column: "full_name" | "name", ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk([...new Set(ids)])) {
    if (part.length === 0) continue;
    const { data } = await client.from(table).select(`id, ${column}`).in("id", part);
    for (const r of (data ?? []) as unknown as Array<Record<string, string>>) out.set(r.id!, r[column]!);
  }
  return out;
}

export async function listAudit(client: SupabaseClient, filters: AuditFilters): Promise<AuditPage> {
  const page = filters.page ?? 1;
  let q = client.from("audit_log").select("id, created_at, action, actor_id, entity_type, entity_id, before, after, reason", { count: "exact" });
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.actor_id) q = q.eq("actor_id", filters.actor_id);
  // Cairo calendar days: [from 00:00, to + 1 day 00:00) in Africa/Cairo
  if (filters.from) q = q.gte("created_at", cairoMidnight(filters.from).toISOString());
  if (filters.to) q = q.lt("created_at", cairoMidnight(addDays(filters.to, 1)).toISOString());
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  const { data, error, count } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, from + AUDIT_PAGE_SIZE - 1);
  if (error) throw new Error(error.message);
  const raw = (data ?? []) as Raw[];

  const staffIds = raw.flatMap((r) => [r.actor_id, r.entity_type === "profile" ? r.entity_id : null, r.after?.coach_id, r.before?.coach_id]).filter((x): x is string => typeof x === "string");
  const memberIds = raw.map((r) => auditMemberId(r.entity_type, r.entity_id, r.before, r.after)).filter((x): x is string => !!x);
  const seasonIds = raw.filter((r) => r.entity_type === "season" && r.entity_id).map((r) => r.entity_id!);
  const [staff, members, seasons] = await Promise.all([
    namesOf(client, "profiles", "full_name", staffIds),
    namesOf(client, "members", "full_name", memberIds),
    namesOf(client, "seasons", "name", seasonIds),
  ]);

  const total = count ?? raw.length;
  return {
    page,
    total,
    pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    rows: raw.map((r) => {
      const memberId = auditMemberId(r.entity_type, r.entity_id, r.before, r.after);
      const target =
        memberId ? members.get(memberId) ?? null
        : r.entity_type === "season" && r.entity_id ? seasons.get(r.entity_id) ?? null
        : r.entity_type === "profile" && r.entity_id ? staff.get(r.entity_id) ?? null
        : null;
      return {
        id: r.id,
        created_at: r.created_at,
        action: r.action,
        actor_name: r.actor_id ? staff.get(r.actor_id) ?? null : null,
        entity_type: r.entity_type,
        target,
        reason: r.reason,
        changes: auditChanges(r.entity_type, r.before, r.after, (id) => staff.get(id) ?? null),
      };
    }),
  };
}
