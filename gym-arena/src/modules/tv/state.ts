import "server-only";

import { createHash, createHmac } from "node:crypto";
import { chunk, fetchAll } from "@/lib/supabase/fetch-all";
import { createServiceClient } from "@/lib/supabase/service";
import { daysBetween, type IsoDate } from "@/lib/time";
import { rankParticipants, type BoardSeason } from "@/modules/leaderboard/board";
import { coachNamesOf, loadSeasonInputs } from "@/modules/leaderboard/service";
import {
  duplicateNameTags,
  liveContent,
  preseasonContent,
  resolveTvMode,
  revealWinners,
  sameNameKey,
  seasonSummary,
  versionMaterial,
  type FrozenPodiumRow,
  type TagSource,
  type TvMember,
  type TvTag,
  type TvSeasonRow,
  type TvState,
} from "./payload";
import { ensureDailySnapshot, readSnapshot } from "./snapshots";
import type { TvSettings } from "./settings";

/**
 * GET /api/tv/state data path. The TV has no staff session: the caller (route) has already
 * checked the TV key in constant time. Reads are curated service-role reads; the response is
 * the allow-list built in payload.ts (BR-X2). Points and ranks: modules/scoring for live
 * seasons, the frozen season_results for the reveal (D30) — never a second formula.
 *
 * The computed state is cached in this process for a few seconds (SYSTEM_ARCHITECTURE
 * "Leaderboard computation"), so several screens polling every 10 s cost one computation.
 */
const AVATARS = "avatars";
const PHOTO_URL_SECONDS = 3600;
const PHOTO_REUSE_MS = 45 * 60_000; // re-issue well before the 1-hour URL expires
const STATE_CACHE_MS = 5_000;

const photoCache = new Map<string, { url: string; at: number }>();
let stateCache: { key: string; at: number; state: TvState } | null = null;

async function signedPhotos(paths: readonly string[], now: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const missing: string[] = [];
  for (const p of new Set(paths)) {
    const hit = photoCache.get(p);
    if (hit && now - hit.at < PHOTO_REUSE_MS) out.set(p, hit.url);
    else missing.push(p);
  }
  for (const part of chunk(missing, 500)) {
    const { data } = await createServiceClient().storage.from(AVATARS).createSignedUrls(part, PHOTO_URL_SECONDS);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl && !item.error) {
        out.set(item.path, item.signedUrl);
        photoCache.set(item.path, { url: item.signedUrl, at: now });
      }
    }
  }
  return out;
}

/** An opaque, stable row token for this TV key (rotating the key rotates every token). */
function refMaker(tvKey: string) {
  return (memberId: string) => createHmac("sha256", tvKey).update(memberId).digest("base64url").slice(0, 16);
}

async function listSeasons(): Promise<TvSeasonRow[]> {
  const { data, error } = await createServiceClient()
    .from("seasons")
    .select("id, name, type, starts_on, ends_on, closed_at, reveal_started_at")
    .order("starts_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TvSeasonRow[];
}

/**
 * D34 tags for the people who can appear on this TV. The member code is read only for members
 * whose name is shared (rare), and leaves this module only as the short number "#127".
 */
async function tagsFor(people: ReadonlyMap<string, { full_name: string; coach_name: string | null }>, refOf: (id: string) => string): Promise<Map<string, TvTag>> {
  const counts = new Map<string, number>();
  for (const p of people.values()) counts.set(sameNameKey(p.full_name), (counts.get(sameNameKey(p.full_name)) ?? 0) + 1);
  const shared = [...people].filter(([, p]) => (counts.get(sameNameKey(p.full_name)) ?? 0) > 1);
  if (shared.length === 0) return new Map();
  const codes = new Map<string, string>();
  for (const ids of chunk(shared.map(([id]) => id))) {
    const { data, error } = await createServiceClient().from("members").select("id, member_code").in("id", ids);
    if (error) throw new Error(error.message);
    for (const m of data ?? []) codes.set(m.id as string, m.member_code as string);
  }
  const sources = new Map<string, TagSource>(shared.map(([id, p]) => [id, { full_name: p.full_name, coach_name: p.coach_name, member_code: codes.get(id) ?? null }]));
  return duplicateNameTags(sources, (id) => `#${refOf(id).slice(0, 4)}`);
}

/** Everyone ranked in a closed season, for the reveal's D34 tags (a winner may share a name with a non-winner). */
async function frozenParticipants(seasonId: string): Promise<Map<string, { full_name: string; coach_name: string | null }>> {
  type Row = { member_id: string; members: { full_name: string; coach_id: string } | null };
  const rows = await fetchAll<Row>((from, to) =>
    createServiceClient()
      .from("season_results")
      .select("member_id, members(full_name, coach_id)")
      .eq("season_id", seasonId)
      .or("rank.not.is.null,rookie_rank.not.is.null")
      .order("member_id")
      .range(from, to) as never,
  );
  const coaches = await coachNamesOf(rows.map((r) => r.members?.coach_id).filter((x): x is string => !!x));
  const out = new Map<string, { full_name: string; coach_name: string | null }>();
  for (const r of rows) if (r.members) out.set(r.member_id, { full_name: r.members.full_name, coach_name: coaches.get(r.members.coach_id) ?? null });
  return out;
}

type MemberDisplay = { full_name: string; status: string; photo_path: string | null; photo_consent: boolean };

async function frozenPodium(seasonId: string, now: number): Promise<{ rows: FrozenPodiumRow[]; members: Map<string, Omit<TvMember, "is_active">> }> {
  type Row = FrozenPodiumRow & { members: MemberDisplay | null };
  const rows = await fetchAll<Row>((from, to) =>
    createServiceClient()
      .from("season_results")
      .select("member_id, rank, total::text, members(full_name, status, photo_path, photo_consent)")
      .eq("season_id", seasonId)
      .not("rank", "is", null)
      .lte("rank", 3)
      .order("member_id")
      .range(from, to) as never,
  );
  const photos = await signedPhotos(rows.flatMap((r) => (r.members?.photo_consent && r.members.photo_path ? [r.members.photo_path] : [])), now);
  const members = new Map<string, Omit<TvMember, "is_active">>();
  for (const r of rows) {
    if (!r.members) continue;
    const consented = r.members.photo_consent && r.members.photo_path;
    members.set(r.member_id, { full_name: r.members.full_name, photo_url: consented ? photos.get(r.members.photo_path!) ?? null : null });
  }
  return { rows, members };
}

export async function buildTvState(settings: TvSettings & { tvKey: string }, today: IsoDate, nowDate: Date = new Date()): Promise<TvState> {
  const now = nowDate.getTime();
  const cacheKey = createHash("sha256").update(`${settings.tvKey}|${settings.locale}|${settings.gymName}|${today}`).digest("hex");
  if (stateCache && stateCache.key === cacheKey && now - stateCache.at < STATE_CACHE_MS) {
    return { ...stateCache.state, server_time: nowDate.toISOString() };
  }

  const refOf = refMaker(settings.tvKey);
  const decision = resolveTvMode(await listSeasons(), today);
  const base: Omit<TvState, "version" | "server_time"> = {
    locale: settings.locale,
    gym_name: settings.gymName,
    mode: decision.mode,
    season: seasonSummary(decision.season, today),
    next_season_starts_on: decision.next?.starts_on ?? null,
    next_season_in_days: decision.next ? daysBetween(today, decision.next.starts_on) : null,
    between: decision.between ? { reason: decision.between } : null,
    board: [],
    rookies: [],
    recent_bests: [],
    preseason: null,
    reveal: null,
  };

  const s = decision.season;
  if (s && (decision.mode === "live" || decision.mode === "preseason")) {
    const season: BoardSeason = { id: s.id, name: s.name, type: s.type, starts_on: s.starts_on, ends_on: s.ends_on };
    const inputs = await loadSeasonInputs(season);
    // photos for active, consented members only (BR-P5, BR-P8)
    const consented = [...inputs.members.values()].filter((m) => m.is_active && m.photo_consent && m.photo_path).map((m) => m.photo_path!);
    const photos = await signedPhotos(consented, now);
    const members = new Map<string, TvMember>();
    for (const [id, m] of inputs.members) {
      members.set(id, { full_name: m.full_name, is_active: m.is_active, photo_url: m.photo_consent && m.photo_path ? photos.get(m.photo_path) ?? null : null });
    }
    // D34: tags among the active participants — everyone this TV can show in this season
    const tags = await tagsFor(new Map([...inputs.members].filter(([, m]) => m.is_active)), refOf);
    if (decision.mode === "live") {
      await ensureDailySnapshot(season, inputs.participants, today);
      const snapshot = await readSnapshot(season.id, today);
      Object.assign(
        base,
        liveContent({ standings: rankParticipants(season, inputs.participants), members, records: inputs.records, seasonStart: season.starts_on, today, snapshot, refOf, tags }),
      );
    } else {
      base.preseason = preseasonContent(inputs.participants, members, inputs.records, season.starts_on, refOf, tags);
    }
  } else if (s && decision.mode === "reveal" && s.reveal_started_at) {
    const { rows, members } = await frozenPodium(s.id, now);
    const tags = await tagsFor(await frozenParticipants(s.id), refOf);
    base.reveal = { started_at: s.reveal_started_at, winners: revealWinners(rows, members, refOf, tags) };
  }

  const state: TvState = {
    version: createHash("sha256").update(versionMaterial(base)).digest("base64url").slice(0, 20),
    server_time: nowDate.toISOString(),
    ...base,
  };
  stateCache = { key: cacheKey, at: now, state };
  return state;
}
