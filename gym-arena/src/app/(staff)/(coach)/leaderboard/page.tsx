import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader } from "@/components/app-header";
import { LeaderboardScreen } from "@/components/coach/leaderboard-screen";
import { LoadError } from "@/components/coach/load-error";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import type { Leaderboard } from "@/modules/leaderboard/board";
import { getLeaderboard } from "@/modules/leaderboard/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.leaderboard");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

// UX C6 Leaderboard (read-only): the same global ranking as the TV, own clients highlighted.
// The coach layout already admits only an active coach; the board comes from the leaderboard
// service (season visible under the coach's RLS, then the server-side ranking — no other
// coach's member ids, phones, codes, raw results or evidence).
export default async function LeaderboardPage() {
  const [profile, t] = await Promise.all([getCurrentProfile(), getTranslations("coach")]);
  let board: Leaderboard | null = null;
  let failed = false;
  try {
    const r = await getLeaderboard(await createClient(), { id: profile!.id, role: profile!.role === "admin" ? "admin" : "coach" }, undefined, today());
    if (r.ok) board = r.data;
    else failed = true;
  } catch {
    failed = true;
  }
  return (
    <>
      <AppHeader title={t("leaderboard.title")} subtitle={board?.season.name ?? t("role")} />
      {failed ? <LoadError /> : <LeaderboardScreen board={board} />}
    </>
  );
}
