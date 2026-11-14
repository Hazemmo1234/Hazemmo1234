import { NextResponse, type NextRequest } from "next/server";
import { apiError, type ErrorCode } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { createCoachSchema } from "@/lib/validation/coaches";
import { createCoach, listCoaches } from "@/modules/coaches/service";

const code = (c: ErrorCode | "UNKNOWN"): ErrorCode => (c === "UNKNOWN" ? "VALIDATION" : c);

// GET /api/coaches (admin) — name, email, status, sign-in block, active clients
export async function GET() {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  return NextResponse.json({ coaches: await listCoaches(await createClient()) });
}

// POST /api/coaches (admin) { full_name, email, password } → { id }. The password is
// handed to Supabase Auth only; it is never returned or logged.
export async function POST(request: NextRequest) {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const parsed = createCoachSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("VALIDATION", "Invalid coach", parsed.error.issues[0]?.message);
  const result = await createCoach(await createClient(), parsed.data);
  if (!result.ok) return apiError(code(result.code), "Could not create coach", result.reason);
  return NextResponse.json({ coach: result.data }, { status: 201 });
}
