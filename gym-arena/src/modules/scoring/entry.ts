/**
 * Entry inputs: validation (§2, BR-E4) and the comparable value of an entry (§1–§2).
 */
import { Rational, type Decimal } from "./rational";
import {
  LIFT_REPS,
  LIFT_WEIGHT_MAX_KG,
  LIFT_WEIGHT_STEP_KG,
  PULLUPS_REPS_MAX,
  PUSHUPS_REPS_MAX,
  TREADMILL_KM_MAX,
  TREADMILL_KM_MIN,
  TREADMILL_KM_STEP,
  isLift,
} from "./rules";
import type { CategoryCode, ScoringEntry } from "./types";

export interface EntryInput {
  category: CategoryCode;
  weightKg?: Decimal | null;
  reps?: number | null;
  km?: Decimal | null;
}

export type EntryField = "weightKg" | "reps" | "km";
export interface EntryValidationError {
  field: EntryField;
  code: "REQUIRED" | "NOT_ALLOWED" | "INVALID" | "OUT_OF_RANGE" | "STEP";
}

const thirty = Rational.int(30);

/** e1RM = weight_kg × (1 + reps / 30) — Epley (§2). Exact. */
export function e1rm(weightKg: Decimal | Rational, reps: number): Rational {
  return Rational.from(weightKg).mul(thirty.add(Rational.int(reps))).div(thirty);
}

function isMultipleOf(value: Rational, step: Rational): boolean {
  const quotient = value.div(step);
  return quotient.denominator === BigInt(1);
}

function parse(value: Decimal | null | undefined): Rational | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;
  try {
    return Rational.from(value);
  } catch {
    return "invalid";
  }
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

/**
 * Validates the shape of an entry for its category (§2, BR-E4). Returns all errors;
 * an empty list means the entry is valid. Mirrors the database check `entries_shape`.
 */
export function validateEntry(input: EntryInput): EntryValidationError[] {
  const errors: EntryValidationError[] = [];
  const { category } = input;

  if (isLift(category)) {
    const weight = parse(input.weightKg);
    if (weight === null) errors.push({ field: "weightKg", code: "REQUIRED" });
    else if (weight === "invalid") errors.push({ field: "weightKg", code: "INVALID" });
    else if (!weight.gt(Rational.ZERO) || weight.gt(LIFT_WEIGHT_MAX_KG)) errors.push({ field: "weightKg", code: "OUT_OF_RANGE" });
    else if (!isMultipleOf(weight, LIFT_WEIGHT_STEP_KG)) errors.push({ field: "weightKg", code: "STEP" });

    if (input.reps === null || input.reps === undefined) errors.push({ field: "reps", code: "REQUIRED" });
    else if (!LIFT_REPS.includes(input.reps)) errors.push({ field: "reps", code: "OUT_OF_RANGE" });

    if (present(input.km)) errors.push({ field: "km", code: "NOT_ALLOWED" });
    return errors;
  }

  if (category === "pullups" || category === "pushups") {
    const max = category === "pullups" ? PULLUPS_REPS_MAX : PUSHUPS_REPS_MAX;
    if (input.reps === null || input.reps === undefined) errors.push({ field: "reps", code: "REQUIRED" });
    else if (!Number.isInteger(input.reps)) errors.push({ field: "reps", code: "INVALID" });
    else if (input.reps < 0 || input.reps > max) errors.push({ field: "reps", code: "OUT_OF_RANGE" });
    if (present(input.weightKg)) errors.push({ field: "weightKg", code: "NOT_ALLOWED" });
    if (present(input.km)) errors.push({ field: "km", code: "NOT_ALLOWED" });
    return errors;
  }

  // treadmill
  const km = parse(input.km);
  if (km === null) errors.push({ field: "km", code: "REQUIRED" });
  else if (km === "invalid") errors.push({ field: "km", code: "INVALID" });
  else if (km.lt(TREADMILL_KM_MIN) || km.gt(TREADMILL_KM_MAX)) errors.push({ field: "km", code: "OUT_OF_RANGE" });
  else if (!isMultipleOf(km, TREADMILL_KM_STEP)) errors.push({ field: "km", code: "STEP" });
  if (present(input.weightKg)) errors.push({ field: "weightKg", code: "NOT_ALLOWED" });
  if (present(input.reps)) errors.push({ field: "reps", code: "NOT_ALLOWED" });
  return errors;
}

/**
 * The comparable value of an entry (§1): lifts → e1RM (kg), pull-ups/push-ups → reps,
 * treadmill → km. Throws if the entry is not valid (callers validate first).
 */
export function entryValue(entry: EntryInput | ScoringEntry): Rational {
  const errors = validateEntry(entry);
  if (errors.length > 0) {
    throw new RangeError(`Invalid ${entry.category} entry: ${errors.map((e) => `${e.field} ${e.code}`).join(", ")}`);
  }
  if (isLift(entry.category)) return e1rm(entry.weightKg as Decimal, entry.reps as number);
  if (entry.category === "treadmill") return Rational.from(entry.km as Decimal);
  return Rational.int(entry.reps as number);
}
