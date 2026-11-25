# modules/scoring

The single implementation of `docs/SCORING_SPECIFICATION.md` (D14). Pure: no I/O, no clock, no randomness, no imports from outside this folder. "Today" (Cairo) is passed in by the caller from `lib/time.ts`.

| File | Contents |
|---|---|
| `rational.ts` | Exact rational arithmetic (BigInt fractions) |
| `rules.ts` | Constants from §2–§3 (caps, points per unit, input limits) |
| `entry.ts` | Input validation (§2, BR-E4), e1RM (Epley), entry value |
| `points.ts` | Category points for all seven categories (§3) |
| `season.ts` | Baseline/month-best/rookie/attendance reading (§1), member score (§3–§5), ranking and tie-breaks (§5), D29, preseason |
| `preview.ts` | Entry preview and the photo rule (§6) |

## Precision strategy

**Ranking compares exact values.** Every input is a terminating decimal (weights in 0.5 kg steps, integer reps, km in 0.1 steps), and every formula in §2–§3 uses only +, −, ×, ÷, min and max. Every score is therefore a rational number, and the module computes it exactly as a fraction of BigInts. For example, Example A's total is exactly 19606/27 (726.148148…).

Why this preserves the specification:
- §5 says ranking uses full precision. With exact fractions, two mathematically equal totals always compare as equal, and two different totals never do, however small the difference.
- Binary floating point gives neither guarantee: `0.1 + 0.2 !== 0.3`, so two members with the same credited kilometres could get different ranks. Rounding to a fixed number of decimals before comparing would also change the semantics, because it can merge totals that are mathematically different.
- The tie-break order (total → improvement → consistency → shared rank) is applied to the exact values.

**Display is a separate, explicit step:** `roundHalfUp()` for integers (726.15 → 726), and `toFixed(n)` for stored decimals. Neither is used for ranking.

## Owner decisions applied in M1 (spec-consistent clarifications)

- **Photo rule (§6):** exactly the two cases in §6. The attendance an entry records automatically never requires a photo, even when it raises Consistency or the total.
- **New best / PR:** a value above the member's previous highest recorded value in that category, including the baseline. A first-ever value is not a PR, voided entries don't count as recorded, and treadmill entries are never PRs. The spec does not define "new best"; it only uses it in the UX and TV.
- **Duplicate treadmill entries:** the database prevents more than one non-voided entry per member per category per day (BR-E2, unique index `entries_one_per_day`). Summing same-day entries is defensive behaviour only; the 5 km daily cap applies to the day's sum.

## Known limitations (none affect ranking)

1. **Stored frozen results.** `season_results` columns are `numeric(8,4)`, so the close operation (M6) stores `toFixed(4)` values. Ranks are computed from the exact values *before* storing, so two stored rows can show the same 4-decimal total with different ranks. §5 already accepts this for the displayed integers.
2. **Entry values in the database.** `entries.value` is stored rounded to 4 decimals. The scoring module never uses it: it recomputes each value exactly from the raw `weight_kg` / `reps` / `km`. Data loaders (M3/M4/M6) must pass those raw fields, preferably as the strings Postgres returns.
3. **Number inputs.** A JavaScript number is read through its shortest decimal form (72.5 → "72.5", 0.1 → "0.1"). That is exact for any value that was written as a decimal. A number produced by floating-point arithmetic (such as `0.1 + 0.2`) would be read as written (`0.30000000000000004`). Pass database values as strings.
4. **`toNumber()`** is approximate and exists only for display and tests.
