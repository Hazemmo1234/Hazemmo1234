# GYM ARENA — Acceptance Criteria

Format: Given / When / Then. Each maps to an FR.

## Auth & roles
- **AC-1 (FR-1)** Given an inactive coach, when they sign in, then access is denied with "Account inactive".
- **AC-2 (FR-1)** Given a coach, when they open any `/admin` route, then they are redirected to `/today`.
- **AC-3 (BR-X1)** Given coach A, when they request member of coach B via API or direct Supabase query, then 403/empty result.

## Members
- **AC-4 (FR-3)** When a member is created, then `member_code` is the next `GA-XXXXXX`, unique, never reused.
- **AC-5 (FR-3)** When a coach creates a member, then `coach_id` is the coach, regardless of the payload.
- **AC-6 (FR-4)** When admin reassigns a member, then the old assignment is closed, a new one opened, past entries keep `logged_by`, and an audit row exists.
- **AC-7 (BR-P5)** Given an inactive member, then they are absent from TV/leaderboards and entry creation returns 403.

## Entries
- **AC-8 (FR-6)** Given an active season and own active member, when the coach logs Deadlift 95 kg × 5, then `value` = 110.8333 and the card updates.
- **AC-9 (BR-E4)** When reps = 6 for a lift, then 422 VALIDATION.
- **AC-10 (BR-E2)** Given a deadlift already logged today, when logging again, then 409 ALREADY_LOGGED_TODAY.
- **AC-11 (BR-E3)** Coach payload with `performed_on` is ignored; server Cairo date is used. At 23:59 vs 00:01 Cairo, entries land on different days.
- **AC-12 (FR-7)** Given B = 100 and M = 105, when logging e1RM 108 without photo, then 422 PHOTO_REQUIRED; with photo, saved.
- **AC-13 (FR-7)** Given B = 100, when logging e1RM 98 without photo, then saved (no photo needed).
- **AC-14 (FR-7)** Given treadmill credited km = 50, when logging 5 km without photo, then saved.
- **AC-15 (FR-8)** When any entry is saved for a member today, then one `auto` attendance row exists for today; logging a second category does not create another.
- **AC-16 (FR-9)** Given a coach's entry from today, when they undo, then it's voided, points recompute, and an audit row exists. Given yesterday's entry, then 403 VOID_WINDOW_PASSED.
- **AC-17 (BR-E10)** Given the only entry of the day is voided and attendance was `auto`, then attendance is voided too; if `manual`, it stays.
- **AC-18 (BR-S4)** Given no active season, when logging, then 409 NO_ACTIVE_SEASON and the coach sees the next start date.

## Scoring & ranking
- **AC-19 (FR-10)** All worked examples in SCORING_SPECIFICATION §7 pass as unit tests with exact values (±0.0001).
- **AC-20** Leaderboard API, coach view, TV and frozen results produce identical totals and ranks for the same data.
- **AC-21** Rookies never appear in the main board or winners; they appear in the rookies list.

## Seasons
- **AC-22 (FR-5)** Creating an overlapping season fails with a clear error.
- **AC-23 (FR-13)** Close is disabled until today > ends_on; after close, `season_results` contain every participant, and any entry write/void/edit for that season returns 409 SEASON_CLOSED.
- **AC-24 (FR-13)** After "Start reveal", the TV runs the reveal sequence; refreshing the TV mid-reveal resumes at the correct step.
- **AC-25 (BR-S6)** Extending `ends_on` before close keeps logging open until the new date.

## TV
- **AC-26 (FR-12)** Invalid key → "Display not authorized"; payload never includes phone, member_code, coach notes, or evidence URLs.
- **AC-27** An entry saved by a coach appears on the TV within 15 s.
- **AC-28** Member without photo consent shows initials avatar even if a photo exists.
- **AC-29** Network loss for 60 s: last state remains on screen; recovers automatically.
- **AC-30** Rank arrows reflect change since start of the Cairo day.

## Coach UX
- **AC-31** From the Today screen, logging a non-photo entry takes ≤ 4 taps + typing the number.
- **AC-32** All coach screens usable at 360 px width; tap targets ≥ 44 px.
