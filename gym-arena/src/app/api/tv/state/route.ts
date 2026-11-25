import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { today } from "@/lib/time";
import { tvKeyMatches } from "@/modules/tv/key";
import { getTvSettings } from "@/modules/tv/settings";
import { buildTvState } from "@/modules/tv/state";

export const dynamic = "force-dynamic";

// GET /api/tv/state?key=… (public, key-protected — API_SPECIFICATION "TV", D3, D4).
// No staff session: the key is compared in constant time against the stored key on EVERY
// request, so a rotated key stops working immediately. 401 for a missing or wrong key.
export async function GET(request: NextRequest) {
  const settings = await getTvSettings();
  const key = request.nextUrl.searchParams.get("key");
  if (!settings.tvKey || !tvKeyMatches(key, settings.tvKey)) {
    return apiError("UNAUTHENTICATED", "Display not authorized");
  }
  try {
    const state = await buildTvState({ ...settings, tvKey: settings.tvKey }, today());
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch {
    // the screen keeps its last state and retries (UX C: never a blank screen)
    return NextResponse.json({ error: { code: "UNKNOWN", message: "TV state unavailable" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
