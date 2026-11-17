import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { AppHeader } from "@/components/app-header";
import { MemberCardScreen } from "@/components/coach/member-card-screen";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { today } from "@/lib/time";
import { memberCard, seasonContext } from "@/modules/entries/service";
import { getMember } from "@/modules/members/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coach.card");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

// UX C3 member card. Another coach's client is simply not found (RLS, AC-3).
export default async function CoachMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const [profile, t] = await Promise.all([getCurrentProfile(), getTranslations("coach")]);
  const client = await createClient();
  const day = today();
  const member = await getMember(client, id, day);
  if (!member) notFound();
  const [card, context] = await Promise.all([memberCard(client, profile!.id, id, day), seasonContext(client, day)]);
  return (
    <>
      <AppHeader title={profile?.full_name ?? ""} subtitle={t("role")} />
      <MemberCardScreen member={member} initialCard={card!} next={context.next} closedSeason={context.closed} />
    </>
  );
}
