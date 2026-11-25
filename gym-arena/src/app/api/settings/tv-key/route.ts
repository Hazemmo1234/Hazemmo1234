import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireRole } from "@/lib/api-auth";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { regenerateTvKey } from "@/modules/settings/service";

// POST /api/settings/tv-key (admin) — rotate the TV key (D3). The new key is created on the
// server; the previous key is rejected on the very next TV request. Audited as
// `tv_key.regenerate` by the database, without the key.
export async function POST() {
  const auth = await requireRole("admin");
  if ("error" in auth) return auth.error;
  const settings = await regenerateTvKey(await createClient(), await requestOrigin());
  if (!settings) return apiError("FORBIDDEN", "Could not regenerate the TV key");
  return NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
}
