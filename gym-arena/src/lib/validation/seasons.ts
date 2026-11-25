import { z } from "zod";
import { isIsoDate } from "@/lib/time";

/** Shared by the season form (client) and the seasons API (server) — SYSTEM_ARCHITECTURE "lib/validation". */
export const SEASON_NAME_MAX = 80;

const isoDate = z.string().refine(isIsoDate, { message: "invalid_date" });
const name = z.string().trim().min(1, { message: "name_required" }).max(SEASON_NAME_MAX, { message: "name_too_long" });

export const createSeasonSchema = z
  .object({
    name,
    type: z.enum(["championship", "preseason"]),
    starts_on: isoDate,
    ends_on: isoDate,
  })
  .strict()
  .refine((v) => v.ends_on >= v.starts_on, { message: "end_before_start", path: ["ends_on"] });

/** API: `{ name?, ends_on? }`, plus `starts_on` while the season is scheduled. */
export const updateSeasonSchema = z
  .object({ name: name.optional(), starts_on: isoDate.optional(), ends_on: isoDate.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "nothing_to_update" });

export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;
export type UpdateSeasonInput = z.infer<typeof updateSeasonSchema>;
