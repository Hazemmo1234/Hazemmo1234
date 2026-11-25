/**
 * GYM ARENA scoring engine — the single implementation of SCORING_SPECIFICATION.md.
 * Pure: no I/O, no clock, no randomness. Imports nothing outside this folder.
 */
export { Rational, sum, type Decimal } from "./rational";
export * from "./types";
export * from "./rules";
export { e1rm, entryValue, validateEntry, type EntryField, type EntryInput, type EntryValidationError } from "./entry";
export {
  consistencyPoints,
  isTestCategoryAtCap,
  liftImprovementPercent,
  testCategoryPoints,
  treadmillCreditedKm,
  treadmillPoints,
} from "./points";
export { compareScores, memberSeasonValues, rankScores, rankSeason, scoreMember, scoreSeason, winners } from "./season";
export { isPhotoRequired, previewEntry, type EntryPreview, type PreviewResult } from "./preview";
