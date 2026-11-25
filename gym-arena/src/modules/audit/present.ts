/**
 * Audit log presentation (UX A6, BR-E11). Pure. The audit rows are written by the database
 * (immutable — no update, no delete); this only decides what the screen shows of before/after:
 * an allow-list of meaningful fields per entity, so internal values (storage paths, phones,
 * ids) never reach the page. The TV key is never in the audit log at all.
 */
export const AUDIT_ACTIONS = [
  "entry.edit",
  "entry.void",
  "member.reassign",
  "member.activate",
  "member.deactivate",
  "coach.activate",
  "coach.deactivate",
  "profile.role",
  "season.create",
  "season.extend",
  "season.close",
  "season.reveal",
  "settings.gym_name",
  "settings.tv_locale",
  "tv_key.regenerate",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export function isAuditAction(v: unknown): v is AuditAction {
  return typeof v === "string" && (AUDIT_ACTIONS as readonly string[]).includes(v);
}

const FIELDS: Record<string, readonly string[]> = {
  entry: ["performed_on", "weight_kg", "reps", "km", "value"],
  member: ["coach_id", "status"],
  season: ["name", "type", "starts_on", "ends_on", "results", "reveal_started_at"],
  profile: ["role", "is_active"],
  app_settings: ["gym_name", "tv_locale"],
};
/** fields holding a staff id, shown as that person's name */
const STAFF_FIELDS = new Set(["coach_id"]);

export interface AuditChange {
  field: string;
  before: string | null;
  after: string | null;
}

type Json = Record<string, unknown> | null;

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return String(Number(v.toFixed(4)));
  if (typeof v === "string" && /^-?\d+\.\d+$/.test(v)) return String(Number(v));
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

/** The visible changes of one audit row (fields that differ, or every allowed field of a create). */
export function auditChanges(entityType: string, before: Json, after: Json, staffName: (id: string) => string | null): AuditChange[] {
  const fields = FIELDS[entityType] ?? [];
  const out: AuditChange[] = [];
  for (const field of fields) {
    const b = before?.[field];
    const a = after?.[field];
    if (before && after && JSON.stringify(b) === JSON.stringify(a)) continue;
    if (b === undefined && a === undefined) continue;
    const show = (v: unknown) => (STAFF_FIELDS.has(field) && typeof v === "string" ? staffName(v) ?? "—" : text(v));
    out.push({ field, before: show(b), after: show(a) });
  }
  return out;
}

/** The member an entry/member row is about (for the "target" column). */
export function auditMemberId(entityType: string, entityId: string | null, before: Json, after: Json): string | null {
  if (entityType === "member") return entityId;
  if (entityType === "entry") {
    const id = (after?.member_id ?? before?.member_id) as unknown;
    return typeof id === "string" ? id : null;
  }
  return null;
}
