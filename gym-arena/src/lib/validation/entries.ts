import { z } from "zod";

/**
 * Entries API input (API_SPECIFICATION "Entries"). Shared by the entry sheet (client) and
 * the API (server). This is the SHAPE only (which fields a category takes). The exact
 * rules — lift reps ∈ {3,4,5}, weight step 0.5, reps and km ranges, km step 0.1 (BR-E4) —
 * come from modules/scoring `validateEntry`, the function the database check mirrors.
 *
 * Weights and kilometres travel as decimal strings so they are read exactly ("72.5").
 */
const decimal = z
  .union([z.number().nonnegative(), z.string().trim().regex(/^\d{1,3}(\.\d{1,4})?$/, { message: "invalid_number" })])
  .transform((v) => String(v));
const reps = z.number().int({ message: "invalid_number" }).min(0).max(1000);
const guid = z.guid();

const base = { member_id: guid };
const write = {
  photo_path: z.string().max(200).optional(),
  /** admin only (BR-E3, D7); the database ignores it for coaches */
  performed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};

function shapes<E extends z.ZodRawShape>(extra: E) {
  return z.discriminatedUnion("category", [
    z.object({ ...base, ...extra, category: z.literal("deadlift"), weight_kg: decimal, reps }).strict(),
    z.object({ ...base, ...extra, category: z.literal("bench"), weight_kg: decimal, reps }).strict(),
    z.object({ ...base, ...extra, category: z.literal("squat"), weight_kg: decimal, reps }).strict(),
    z.object({ ...base, ...extra, category: z.literal("pullups"), reps }).strict(),
    z.object({ ...base, ...extra, category: z.literal("pushups"), reps }).strict(),
    z.object({ ...base, ...extra, category: z.literal("treadmill"), km: decimal }).strict(),
  ]);
}

/** POST /api/entries/preview — the same input as the save, without the write-only fields. */
export const previewEntrySchema = shapes({});
/** POST /api/entries */
export const createEntrySchema = shapes(write);

export type PreviewBody = z.infer<typeof previewEntrySchema>;
export type CreateEntryBody = z.infer<typeof createEntrySchema>;

/** POST /api/entries/:id/void — reason required for the admin (checked by the database). */
export const voidEntrySchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();
/** POST /api/attendance */
export const attendanceSchema = z.object({ member_id: guid }).strict();
/** POST /api/uploads/evidence — API_SPECIFICATION: `{ member_id }`; the optional content_type picks .webp (default) or .jpg. */
export const evidenceUploadSchema = z.object({ member_id: guid, content_type: z.enum(["image/webp", "image/jpeg"]).default("image/webp") }).strict();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * PATCH /api/entries/:id (admin, until close) — API_SPECIFICATION. The written reason is
 * mandatory (BR-E9, AC-47); at least one value or the date must change. The category rules
 * (BR-E4) are applied to the merged values by modules/scoring `validateEntry` on the server.
 */
export const editEntrySchema = z
  .object({
    weight_kg: decimal.optional(),
    reps: reps.optional(),
    km: decimal.optional(),
    performed_on: isoDate.optional(),
    reason: z.string().trim().min(1, { message: "reason_required" }).max(300),
  })
  .strict()
  .refine((v) => v.weight_kg !== undefined || v.reps !== undefined || v.km !== undefined || v.performed_on !== undefined, { message: "nothing_to_change" });
export type EditEntryBody = z.infer<typeof editEntrySchema>;

/** GET /api/entries (admin) — the A5 log filters. */
export const entriesQuerySchema = z.object({
  season_id: guid.optional(),
  member_id: guid.optional(),
  coach_id: guid.optional(),
  category: z.enum(["deadlift", "bench", "squat", "pullups", "pushups", "treadmill"]).optional(),
  date: isoDate.optional(),
  q: z.string().trim().max(80).optional(),
  include_voided: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});
export type EntriesQuery = z.infer<typeof entriesQuerySchema>;
