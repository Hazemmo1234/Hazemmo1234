# GYM ARENA — Test Plan

## Levels
| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | `modules/scoring` (100% branches), `lib/time`, zod schemas, photo rule | CI must pass |
| Database | pgTAP or Vitest against local Supabase (`supabase start`) | RLS policies, constraints, `log_entry` function, unique indexes, overlap exclusion | CI must pass |
| API integration | Vitest + local Supabase | Every endpoint's happy path + each error code | CI must pass |
| E2E | Playwright (mobile viewport for coach, 1920×1080 for TV) | Golden journeys below | Before each release |
| Manual | Real phone + gym TV | Readability at 5 m, camera upload, PWA install | Before launch |

## Scoring unit tests (required)
- All rows of SCORING §7 (Examples A, B, C).
- Property tests: total ∈ [0, 1000]; adding an entry never decreases a non-rookie's total; voiding the max entry falls back to the next max; category points never exceed max.
- Cairo boundary tests for `today()` (22:00 UTC vs 21:59 UTC in winter/summer — Egypt observes DST).

## RLS tests (required)
- Coach A cannot select/insert/update members, entries, attendance, evidence objects of coach B.
- Coach cannot update `members.coach_id` or `status`.
- Coach cannot insert entry with `performed_on` ≠ today or into a closed season.
- Anonymous client cannot read any table.
- Admin can do everything except modify closed-season data.

## E2E golden journeys
1. Admin creates coach → coach signs in → adds client → logs 3 categories → TV shows client.
2. Coach logs new best → photo required → uploads → saved → TV flashes PR.
3. Coach logs wrong number → Undo → points revert.
4. Admin reassigns client mid-season → history intact → new coach can log.
5. Preseason → baselines logged → season 1 starts → improvements score.
6. Season ends → logging blocked → Admin closes → reveal on TV → History shows winners.
7. Tie on total resolved by improvement points; full tie shows shared rank.

## Test data
`supabase/seed.sql`: 1 admin, 3 coaches, 40 members (5 rookies, 2 inactive), one closed past season, one active season with ~600 entries, deterministic values so ranks are known.

## Pre-launch checklist
- TV at gym resolution: names readable from 5 m.
- Coach timing test: 5 real entries, median < 15 s.
- Cairo DST transition dates verified.
- Backups enabled on Supabase project.
