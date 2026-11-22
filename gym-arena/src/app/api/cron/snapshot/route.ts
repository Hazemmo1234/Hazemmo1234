import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { createServiceClient } from "@/lib/supabase/service";
import { today } from "@/lib/time";
import type { BoardSeason } from "@/modules/leaderboard/board";
import { loadSeasonInputs } from "@/modules/leaderboard/service";
import { activeSeason } from "@/modules/seasons/status";
import { ensureDailySnapshot } from "@/modules/tv/snapshots";

export const dynamic = "force-dynamic";

/**
 * Daily rank snapshot job (SYSTEM_ARCHITECTURE "Scheduled jobs": 00:05 Cairo). Authenticated by
 * the server-only secret CRON_SECRET as `Authorization: Bearer <secret>` (the form Vercel Cron
 * sends); refused when the secret is not configured. Idempotent: the snapshot of a day is
 * written once and computed from data dated before that day, so a late or repeated run writes
 * the same rows or nothing.
 */
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const header = request.headers.get("authorization") ?? "";
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: NextRequest) {
  if (!authorized(request)) return apiError("UNAUTHENTICATED", "Cron secret required");
  const day = today();
  const { data, error } = await createServiceClient().from("seasons").select("id, name, type, starts_on, ends_on, closed_at");
  if (error) return NextResponse.json({ error: { code: "UNKNOWN", message: "Could not read seasons" } }, { status: 500 });
  const season = activeSeason((data ?? []) as Array<BoardSeason & { closed_at: string | null }>, day);
  if (!season || season.type !== "championship") return NextResponse.json({ ok: true, day, written: 0, reason: "no_active_championship" });
  const inputs = await loadSeasonInputs({ id: season.id, name: season.name, type: season.type, starts_on: season.starts_on, ends_on: season.ends_on });
  const written = await ensureDailySnapshot(inputs.season, inputs.participants, day);
  return NextResponse.json({ ok: true, day, written });
}

export const GET = run;
export const POST = run;
