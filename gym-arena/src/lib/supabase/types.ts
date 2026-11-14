/** Minimal hand-written DB types for M0. Replace with `supabase gen types` output as modules grow. */
export type UserRole = "admin" | "coach";

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}
