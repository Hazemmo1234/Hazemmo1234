import "server-only";

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

/**
 * Admin settings (UX A7). Every call uses the ADMIN's own client: RLS limits app_settings to
 * admins, and the database audits each change (app_settings_after_update — the TV key itself
 * is never written to the audit log). The service role is not used here.
 */
export interface AdminSettings {
  gym_name: string;
  tv_locale: Locale;
  /** the TV link including its key — admin-only response, never logged */
  tv_url: string;
}

export interface SettingsPatch {
  gym_name?: string;
  tv_locale?: Locale;
}

type Row = { gym_name: string | null; tv_locale: string; tv_key: string };

export function tvUrl(origin: string, key: string): string {
  return `${origin}/tv?key=${encodeURIComponent(key)}`;
}

function shape(row: Row, origin: string): AdminSettings {
  return {
    gym_name: row.gym_name ?? "",
    tv_locale: isLocale(row.tv_locale) ? row.tv_locale : DEFAULT_LOCALE,
    tv_url: tvUrl(origin, row.tv_key),
  };
}

/**
 * A new TV key: 32 random bytes, URL-safe (43 characters; the table requires ≥ 32 — D3).
 * Generated on the server; the old key stops working on the very next TV request, because the
 * TV route and the TV state API compare against the stored key on every request.
 */
export function newTvKey(): string {
  return randomBytes(32).toString("base64url");
}

export async function getSettings(supabase: SupabaseClient, origin: string): Promise<AdminSettings | null> {
  const { data } = await supabase.from("app_settings").select("gym_name, tv_locale, tv_key").eq("id", 1).maybeSingle<Row>();
  return data ? shape(data, origin) : null;
}

export async function updateSettings(supabase: SupabaseClient, patch: SettingsPatch & { tv_key?: string }, origin: string): Promise<AdminSettings | null> {
  const { data, error } = await supabase.from("app_settings").update(patch).eq("id", 1).select("gym_name, tv_locale, tv_key").maybeSingle<Row>();
  if (error || !data) return null;
  return shape(data, origin);
}

/** POST /api/settings/tv-key — audited as `tv_key.regenerate` (no key in the audit row). */
export async function regenerateTvKey(supabase: SupabaseClient, origin: string): Promise<AdminSettings | null> {
  return updateSettings(supabase, { tv_key: newTvKey() }, origin);
}
