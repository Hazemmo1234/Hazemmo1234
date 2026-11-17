import { z } from "zod";

/** Shared by the coach form (client) and the coaches API (server). */
export const COACH_NAME_MAX = 80;
/** SECURITY_SPECIFICATION §1: minimum password length ≥ 10. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72; // bcrypt limit used by Supabase Auth

const fullName = z.string().trim().min(1, { message: "name_required" }).max(COACH_NAME_MAX, { message: "name_too_long" });

export const createCoachSchema = z
  .object({
    full_name: fullName,
    email: z.string().trim().toLowerCase().email({ message: "invalid_email" }),
    password: z.string().min(PASSWORD_MIN, { message: "password_too_short" }).max(PASSWORD_MAX, { message: "password_too_long" }),
  })
  .strict();

/** API: `{ full_name?, is_active? }` (UX A4, D28). */
export const updateCoachSchema = z
  .object({ full_name: fullName.optional(), is_active: z.boolean().optional() })
  .strict()
  .refine((v) => v.full_name !== undefined || v.is_active !== undefined, { message: "nothing_to_update" });

export type CreateCoachInput = z.infer<typeof createCoachSchema>;
export type UpdateCoachInput = z.infer<typeof updateCoachSchema>;
