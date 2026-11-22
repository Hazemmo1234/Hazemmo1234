import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LoadError } from "@/components/coach/load-error";
import { SettingsManager } from "@/components/settings/settings-manager";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/modules/settings/service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export const dynamic = "force-dynamic";

// UX A7 Settings — gym name, TV language, TV link (copy) and key rotation.
// The admin layout has already verified the caller is an active admin; RLS applies again here.
export default async function SettingsPage() {
  const settings = await getSettings(await createClient(), await requestOrigin());
  if (!settings) return <LoadError />;
  return <SettingsManager initial={settings} />;
}
