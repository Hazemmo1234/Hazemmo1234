# GYM ARENA — Scoring Specification

All scoring is computed **server-side** by one pure TypeScript module (`src/modules/scoring`). The same function powers the coach preview, the admin view, the TV, and the frozen final results. It must be 100% deterministic and fully unit-tested.

Timezone for all "day" logic: **Africa/Cairo**. A "day" = a Cairo calendar date.

## 1. Definitions

| Term | Definition |
|---|---|
| Season | One monthly championship with `starts_on` and `ends_on` (Cairo dates, inclusive). |
| Entry | One logged result for one member, one category, one day. Voided entries are ignored everywhere. |
| Value | The comparable number of an entry: lifts → e1RM (kg); pull-ups/push-ups → reps; treadmill → km. |
| Baseline `B` | For a member + test category: the **maximum value** of all non-voided entries with `performed_on < season.starts_on`. `null` if none. |
| Month best `M` | For a member + category: the **maximum value** of non-voided entries with `starts_on ≤ performed_on ≤ ends_on`. `null` if none. |
| Test categories | Deadlift, Bench, Squat, Pull-ups, Push-ups. |
| Rookie (season level) | A member with **zero non-voided entries in any category** dated before `season.starts_on`. |

## 2. e1RM (lifts only)
```
e1RM = weight_kg × (1 + reps / 30)          // Epley
```
- `reps` must be an integer in **{3, 4, 5}**. Any other value is rejected at input.
- `weight_kg` > 0, step 0.5, max 500.
- Store `e1rm` on the entry (numeric, full precision) at write time.

## 3. Category points

```
clamp(x, lo, hi) = min(max(x, lo), hi)
```

| Category | Max | Points |
|---|---|---|
| Deadlift, Bench, Squat | 100 each | if `B` or `M` is null → 0; else `clamp((M − B) / B × 100, 0, 15) / 15 × 100` |
| Pull-ups | 150 | if `B` or `M` is null → 0; else `clamp(M − B, 0, 5) × 30` |
| Push-ups | 150 | if `B` or `M` is null → 0; else `clamp(M − B, 0, 10) × 15` |
| Treadmill | 200 | `clamp(Σ over season days of min(day_km, 5), 0, 50) × 4` |
| Consistency | 200 | `planned = season_participant.planned_sessions (≥ 1)`; `attended = count of distinct attendance days in season`; `min(attended / planned, 1) × min(planned / 12, 1) × 200` |

Rules:
- **No negative points.** A result below baseline gives 0 in that category and does **not** change `B` for this season.
- **Missing baseline in one category** (non-rookie member who never logged that category before): that category scores 0 this season; this season's entries become next season's baseline.
- Pull-ups baseline of 0 reps is valid (`B = 0`).
- Treadmill: max one entry per day, so `day_km` = that entry's km. Treadmill does not need a baseline.
- Consistency: `min(attended / planned, 1)` — **attending more than planned never exceeds 200.**

## 4. Rookies
- Test categories always score 0 for a Rookie.
- Rookies earn Treadmill + Consistency normally.
- Rookies are **excluded from the main leaderboard and from Top 3**; they appear in a separate Rookies list ranked by total.

## 5. Totals and ranking
```
improvement_points = Deadlift + Bench + Squat + Pull-ups + Push-ups
total              = improvement_points + Treadmill + Consistency     // 0..1000
```
Ranking (main board = non-rookie participants of the season; Rookies list = rookies):
1. `total` desc (full precision)
2. `improvement_points` desc
3. `consistency` desc
4. Still equal on all three → **same rank** (standard competition ranking: 1, 1, 3).

Display: integers, rounded half-up (`726.15 → 726`). Ranking always uses full precision; two rows may show the same integer with different ranks (accepted).

## 6. Photo requirement (input rule, not scoring)
An entry **requires a photo** if saving it would **increase the member's season total**:
- test category: non-rookie, `B` not null, value > max(`B`, current `M`), and the category is not already at its cap;
- treadmill: credited km so far < 50.
Otherwise photo is optional. Attendance never needs a photo. During a `preseason` no entry increases points, so photos are never required. The server re-checks this rule on save.

Preseason: seasons of type `preseason` produce **no points, no ranking, no winners**; their entries only serve as baselines for the next championship.

## 7. Worked examples (must be unit tests)

### Example A — full member
| Category | B | Month entries | M | Points |
|---|---|---|---|---|
| Deadlift | 100.00 | 95 kg × 5 → 110.833 | 110.833 | 72.22 |
| Bench | 70.00 | 72.5 kg × 4 → 82.167 | 82.167 | 100.00 (capped at +15%) |
| Squat | 90.00 | 85 kg × 3 → 93.5 | 93.5 | 25.93 |
| Pull-ups | 3 | 6 | 6 | 90 |
| Push-ups | 20 | 28 | 28 | 120 |
| Treadmill | — | days: 5,5,4,5,5,5,5,4,4 (=42) | — | 168 |
| Consistency | planned 10 | attended 9 | — | 150 |
| **Total** | | | | **726.15 → shows 726** |

### Example B — edge cases
| Case | Expected |
|---|---|
| Lift M below B (B 100, M 95) | 0 |
| Lift exactly +15% (B 100, M 115) | 100 |
| Pull-ups B 0, M 2 | 60 |
| Push-ups +14 reps | 150 (cap) |
| Treadmill one day logged 8 km | credited 5 → 20 pts |
| Treadmill 12 days × 5 km | 60 → capped 50 → 200 |
| Consistency planned 12, attended 14 | 200 (not 233.3) |
| Consistency planned 6, attended 6 | 1 × 0.5 × 200 = 100 |
| Non-rookie, never logged squat before | squat = 0 |
| Rookie with M values in all test cats | test cats = 0, in Rookies list |
| Voided entry was the month best | ignored; M = next best |
| Maximum possible | 1000 |

### Example C — ranking
| Member | Total | Improvement | Consistency | Rank | Why |
|---|---|---|---|---|---|
| B | 800.0 | 450 | 150 | 1 | ties A on total, more improvement |
| A | 800.0 | 400 | 200 | 2 | |
| C | 790.4 | 390.4 | 200 | 3 | |
| D | 700.0 | 300 | 200 | 4 | equal to E on all three |
| E | 700.0 | 300 | 200 | 4 | |
| F | 650.0 | 250 | 200 | 6 | competition ranking skips 5 |
