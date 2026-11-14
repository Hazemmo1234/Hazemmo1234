# GYM ARENA — Business Rules

Every rule has an ID. Code comments and tests should reference these IDs.

## Seasons (championships)
- **BR-S1** One season = one calendar month by default (`starts_on` = 1st, `ends_on` = last day). Admin may set other dates; seasons must never overlap.
- **BR-S2** Season types: `preseason` (one-time launch, baselines only, no points, no winners) and `championship`.
- **BR-S3** Statuses: `scheduled` → `active` → `closed`. A season is `active` when today (Cairo) is within its dates; this is derived from dates, not a manual toggle.
- **BR-S4** Logging is allowed only while a season is active. Between seasons (no active season), logging is blocked and the coach sees the next start date.
- **BR-S5** After `ends_on`, logging locks automatically at 00:00 Cairo. The Admin presses **Close** to freeze results (BR-S7). Close is only allowed when `today > ends_on`.
- **BR-S6** Admin can extend `ends_on` only while the season is not closed.
- **BR-S7** Closing writes a frozen copy of every participant's category points, total, and rank into `season_results`. After close, nothing in that season can change. No corrections after close.
- **BR-S8** After close, Admin can trigger the **Winner Reveal** on the TV (3rd → 2nd → 1st).
- **BR-S9** Launch: Season #1 is preceded by a **2-week preseason**. Entries logged in preseason are baselines for Season #1.

## Participants
- **BR-P1** A coach registers only clients who agreed to participate. Registration = consent to appear on the TV with full name.
- **BR-P2** Member ID is generated automatically: `GA-000001`, sequential, never reused.
- **BR-P3** Member fields: full name (required), phone (required, Egyptian mobile format), photo (optional) + photo consent flag, assigned coach, status (`active`/`inactive`), join date. No bodyweight.
- **BR-P4** A member is a participant of every active season while `active`. `planned_sessions` per season defaults to 12; the coach may edit it at any time.
- **BR-P5** `inactive` members are hidden from TV and leaderboards and cannot receive entries; their history is kept. Reactivation restores them.
- **BR-P6** Coach change: Admin reassigns. All past entries keep `logged_by`. Points always belong to the member. Assignment history is stored.
- **BR-P7** Coach deactivation: Admin must reassign the coach's active clients first; the coach can no longer sign in; their entries remain.
- **BR-P8** TV shows the photo only if `photo_consent = true`; otherwise an initials avatar.

## Entries
- **BR-E1** Only coaches (for their own active clients) and the Admin (for anyone) can create entries. Members never log.
- **BR-E2** Max **one non-voided entry per member, per category, per day**. Attendance: max one per member per day.
- **BR-E3** `performed_on` = server's current Cairo date. Coaches cannot backdate. Admin may set a date within the active season (typo fixes).
- **BR-E4** Inputs: lifts = weight (kg, step 0.5) + reps ∈ {3,4,5}; pull-ups 0–100 reps; push-ups 0–300 reps; treadmill 0.1–42.2 km (step 0.1).
- **BR-E5** Entries are auto-approved and count immediately.
- **BR-E6** Photo is required when the entry increases the member's season total (see SCORING §6); optional otherwise.
- **BR-E7** Logging any result for a member automatically records attendance for that day (`source = auto`). A one-tap "Attended" button records attendance with no result (`source = manual`).
- **BR-E8** Nothing is hard-deleted. "Delete" = void (`voided_at`, `voided_by`, `void_reason`).
- **BR-E9** A coach may void their own entry **on the same day only**. The Admin may void or edit any entry until the season is closed.
- **BR-E10** If the voided entry was the member's only entry that day and attendance was `auto`, the auto attendance is voided too.
- **BR-E11** Every Admin edit/void, every coach void, every reassignment, and every season close is written to the audit log (who, when, before, after).

## Rookies
- **BR-R1** Rookie = no entries in any category before the season start (see SCORING §1).
- **BR-R2** Rookies earn only Treadmill + Consistency points, appear in the separate Rookies list, and cannot be Top 3.
- **BR-R3** On the coach screen, a rookie's test tiles show "Building baseline".

## Winners
- **BR-W1** Winners = ranks 1–3 on the main board at close (ties share a rank; if a tie puts 4 people in the top 3 ranks, all are shown as winners — prize handling is outside the system).
- **BR-W2** Final results and winners are permanent and visible in Season History.

## Privacy & security (technical minimum)
- **BR-X1** All staff sign in. Coaches see and edit only their own clients (enforced by RLS).
- **BR-X2** TV payload contains only: rank, full name, photo URL (if consented), points, category points, rank movement, rookie flag, recent new-best events. Never phone numbers, member IDs, coach notes, or evidence photos.
- **BR-X3** Evidence photos are private; visible to the Admin and the coach of that member only, via short-lived signed URLs.
