import "server-only";

import { cache } from "react";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import { createServiceClient } from "@/lib/supabase/service";

export interface TvSettings {
  tvKey: string | null;
  locale: Locale;
  gymName: string | null;
}

/**
 * TV configuration, read once per request. The TV has no staff session, so this is a
 * curated service-role read of the single settings row (SECURITY_SPECIFICATION §3, §6).
 * The TV language is the Admin's setting, never a staff member's language (BR-L4).
 */
export const getTvSettings = cache(async (): Promise<TvSettings> => {
  const { data } = await createServiceClient()
    .from("app_settings")
    .select("tv_key, tv_locale, gym_name")
    .eq("id", 1)
    .maybeSingle<{ tv_key: string; tv_locale: string; gym_name: string | null }>();
  return {
    tvKey: data?.tv_key ?? null,
    locale: isLocale(data?.tv_locale) ? data.tv_locale : DEFAULT_LOCALE,
    gymName: data?.gym_name ?? null,
  };
});
