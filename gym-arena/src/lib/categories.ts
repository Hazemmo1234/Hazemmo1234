import type { CategoryCode } from "@/lib/supabase/types";

/**
 * BR-L5: category names stay in English in both languages (they are the names coaches
 * and members use on the gym floor), so they are constants, not catalog messages.
 */
export const CATEGORY_LABEL: Record<CategoryCode, string> = {
  deadlift: "Deadlift",
  bench: "Bench Press",
  squat: "Squat",
  pullups: "Pull-ups",
  pushups: "Push-ups",
  treadmill: "Treadmill",
};

export const CATEGORY_ORDER: readonly CategoryCode[] = ["deadlift", "bench", "squat", "pullups", "pushups", "treadmill"];

export const isLiftCategory = (c: CategoryCode) => c === "deadlift" || c === "bench" || c === "squat";
