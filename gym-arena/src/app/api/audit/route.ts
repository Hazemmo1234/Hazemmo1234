import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS } from "@/modules/audit/present";
import { listAudit } from "@/modules/audit/service";

const querySchema = z.object({
  action: z.enum(AUDIT_ACTIONS).optional(),
  actor_id: z.guid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

// GET /api/audit (admin) ?action=&actor_id=&from=&to=&page= → paginated audit log, newest first.
// Read-only: audit rows are immutable in the database (BR-E11, SECURITY_SPECIFICATION §9).
export async function GET(request: NextRequest) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const parsed = querySchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams].filter(([, v]) => v !== "")));
  if (!parsed.success) return apiError("VALIDATION", "Invalid filters");
  try {
    return NextResponse.json(await listAudit(await createClient(), parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return apiError("VALIDATION", "Could not read the audit log");
  }
}
