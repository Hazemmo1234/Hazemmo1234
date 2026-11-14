# GYM ARENA — Test Plan

## Levels
| Level | Tool | Scope | Gate |
|---|---|---|---|
| Unit | Vitest | `modules/scoring` (100% branches), `lib/time`, zod schemas, photo rule | CI must pass |
| Database | pgTAP or Vitest against local Supabase (`supabase start`) | RLS policies, constraints, `log_entry` function, unique indexes, overlap exclusion, security regression tests below | CI must pass |
| API integration | Vitest + local Supabase | Every endpoint's happy path + each error code | CI must pass |
| E2E | Playwright (mobile viewport for coach, 1920×1080 for TV) | Golden journeys below | Before each release |
| Manual | Real phone + gym TV | Readability at 5 m, camera upload, PWA install | Before launch |

## Continuous integration (D25 — approved requirement, implemented in the M0 close-out)
| Job | Runs | Notes |
|---|---|---|
| check (exists) | lint, typecheck, unit tests + coverage | unchanged |
| build | `next build` | placeholder public env values only |
| database | local Supabase stack → migrations applied from a clean state → full DB/RLS + security regression suite | disposable database created inside the CI runner and destroyed with it |
| e2e | built app + local stack + seed → Playwright (coach mobile, TV 1920×1080, both languages) | seed runs only here and locally |

Rules: the workflow uses only the local stack's built-in development keys; **no cloud Supabase or Vercel credential is ever added to CI**, the CLI is never linked, and no step uses `--remote`/`--linked`, so CI cannot reach production. No secret values are printed; CLI status output that contains keys is not echoed. Expected runtime (estimate, to be replaced by measured numbers after the first runs): check ≈ 1 min (measured: 50 s today), build ≈ 2 min, database ≈ 3–5 min (mostly image download), e2e ≈ 4–6 min; jobs run in parallel, target total under 10 minutes.

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

## Security regression tests (required — from the M0 audit, each was reproduced on the local stack)
- Direct coach insert into `entries` / `attendance` and direct `log_entry` call are rejected (AC-39); `logged_by` cannot be spoofed (AC-40).
- Direct `closed_at` update, insert of an already-closed season (admin and service role), and `season_id` change are rejected (AC-41).
- Close with missing, extra or fabricated results is impossible; concurrent closes → exactly one success; write racing a close (AC-42, AC-43).
- Preseason close freezes entries and writes no results (AC-44).
- `ends_on` cannot move before existing entries; last active admin cannot be deactivated; coach cannot change `joined_on` / `created_by`.
- `photo_path` outside the member's folder is rejected; evidence upload with an invalid season segment is rejected.
- Deactivated coach's still-valid token reads nothing and writes nothing; new sign-in is refused; existing sessions are revoked (AC-48–50, M2).
- Void ownership: reassigned member's new coach cannot void the previous coach's entry; submitting coach still can, same day; coach cannot void an Admin-submitted entry (AC-45, AC-46).
- Admin void/edit without a reason is rejected; with a reason it is in the audit row (AC-47).
- The season-close database role can do nothing beyond its listed permissions (SECURITY_SPECIFICATION §7).
- `seed.sql` aborts when the local-only marker is absent.

## Localization tests (required)
- Catalog parity: `ar.json` and `en.json` have identical key sets; no empty values.
- Lint rule: no literal user-facing text in components.
- E2E in both languages for every golden journey screen: `lang`/`dir` correct, no horizontal overflow at 360 px, switcher persists (profile and cookie).
- TV language follows `tv_locale`, not the staff cookie; changes within one poll.
- Scoring, ranking and permission tests give identical results under both locales (AC-38).

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
- Production auth settings: public sign-up disabled, minimum password length ≥ 10.
- `seed.sql` has never been run against the cloud project; migrations are add-only from the first cloud deployment.
- Both languages reviewed on a real phone and on the gym TV.
