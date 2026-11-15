import { z } from "zod";
import { normalizeEgyptianMobile } from "@/lib/phone";

/** Shared by the Member Form (client) and the members API (server) — UX C5 / A3. */
export const MEMBER_NAME_MAX = 80;
export const PLANNED_MIN = 1;
export const PLANNED_MAX = 31;

const fullName = z.string().trim().min(1, { message: "name_required" }).max(MEMBER_NAME_MAX, { message: "name_too_long" });
const phone = z
  .string()
  .transform((v, ctx) => {
    const normalized = normalizeEgyptianMobile(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return z.NEVER;
    }
    return normalized;
  });
const planned = z.number().int({ message: "invalid_plan" }).min(PLANNED_MIN, { message: "invalid_plan" }).max(PLANNED_MAX, { message: "invalid_plan" });

export const createMemberSchema = z
  .object({
    full_name: fullName,
    phone,
    photo_consent: z.boolean().default(false),
    /** admin: required; coach: ignored (forced to self by the database, AC-5) */
    coach_id: z.guid().optional(),
    /** current season's plan (BR-P4, default 12) */
    planned_sessions: planned.optional(),
  })
  .strict();

/** PATCH /api/members/:id — profile fields only; photo via photo_path (server-validated). */
export const updateMemberSchema = z
  .object({
    full_name: fullName.optional(),
    phone: phone.optional(),
    photo_consent: z.boolean().optional(),
    photo_path: z.string().max(200).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing_to_update" });

export const reassignMemberSchema = z.object({ coach_id: z.guid({ message: "coach_required" }) }).strict();

/** Reactivation may carry the (active) coach to assign in the same change (decision 5). */
export const memberStatusSchema = z
  .object({ status: z.enum(["active", "inactive"]), coach_id: z.guid().optional() })
  .strict();

export const memberPlanSchema = z.object({ planned_sessions: planned }).strict();

export const avatarUploadSchema = z
  .object({ member_id: z.guid(), content_type: z.enum(["image/webp", "image/jpeg"]) })
  .strict();

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/** Avatar files live at members/{member_id}/{uuid}.{webp|jpg} (DATABASE_SCHEMA "Storage"). */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export function isMemberAvatarPath(path: string, memberId: string): boolean {
  return new RegExp(`^members/${memberId}/${UUID}\\.(webp|jpg)$`).test(path);
}
