import type { Locale } from "@/i18n/config";

/** Minimal hand-written DB types. Replace with `supabase gen types` output as modules grow. */
export type UserRole = "admin" | "coach";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  locale: Locale;
  created_at: string;
}

export type CategoryCode = "deadlift" | "bench" | "squat" | "pullups" | "pushups" | "treadmill";

export interface EntryRow {
  id: string;
  member_id: string;
  season_id: string;
  category: CategoryCode;
  performed_on: string;
  weight_kg: number | null;
  reps: number | null;
  km: number | null;
  value: number;
  photo_path: string | null;
  logged_by: string;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
}
