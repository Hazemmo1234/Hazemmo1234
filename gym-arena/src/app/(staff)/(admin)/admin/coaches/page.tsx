import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CoachesManager } from "@/components/coaches/coaches-manager";
import { isNavReady } from "@/components/admin/nav-items";
import { createClient } from "@/lib/supabase/server";
import { listCoaches } from "@/modules/coaches/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coaches");
  return { title: t("title") };
}

// UX A4 Coaches — list, create, rename, deactivate / reactivate (BR-P7, D28).
// The admin layout has already verified the caller is an active admin.
export default async function CoachesPage() {
  const coaches = await listCoaches(await createClient());
  return <CoachesManager coaches={coaches} membersAvailable={isNavReady("members")} />;
}
