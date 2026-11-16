# Test fixtures on the isolated test stack

Some tests need database states the product itself can never create — above all **entries
dated before the active season** (baselines), and **more rows than the API returns in one
request** (`max_rows = 1000`). Those states are built as *fixtures*, written directly as the
database owner, on disposable stacks only.

## Where fixtures may exist

- The isolated local test stack `gym-arena-test` (API 56321, DB 56322, `scripts/test-stack.sh`).
- CI's disposable stack (fresh migrations + seed, thrown away after the run).

Never the development stack (54321/54322), the experimental stack, or any cloud project.
`tests/db/helpers.ts` refuses to run without `TEST_DB_ISOLATED=1` and refuses the development
ports; the browser fixtures check that the API URL is `:56321` and target only the container
`supabase_db_gym-arena-test`. `supabase/seed.sql` contains **no** fixtures.

## Why they are permanent

Rows can never be deleted (BR-E8: entries, members, seasons and the audit log have no-delete
triggers), so fixtures are created **once per stack and reused**. Every fixture is idempotent:
re-running a test reuses what exists and creates nothing. A full stack reset
(`npm run test:stack -- reset`) is the only way to remove them.

## Isolation from seed and from other tests

| Marker | Value |
|---|---|
| Dates | far in the past (1651, 1652, 1653, 1660+): no overlap with seed seasons or any other test's seasons |
| Coach | the rookie-flag fixture belongs to **coach 3**, whom only the language test uses (coaches 1 and 2 keep their lists) |
| Names | always start with `Rookie fixture` or belong to the season named below |
| Phones | `+2015…` (rookie and G-10 fixtures), `+2012…` (scale fixture, only when it has to create members) |

## The fixtures

### 1. Rookie-flag fixture — `tests/db/rookie-flags.test.ts`

- Season **"Rookie flag fixture"**, championship, 1651-01-01 … 1651-01-28 (open, ended).
- **200 members** of coach 3 named `Rookie fixture <n>`, each with one baseline entry per
  category (6) on 1651-01-10 → 1200 pre-season entries, enough to exceed `max_rows` alone.
- One member **"Rookie fixture fresh"** with no entries at all (a true rookie).
- The fixture set is deterministic: the first 200 qualifying members by member code. Only
  missing members are created; a second `ensureFixture` call creates nothing (tested).

**State of the current test stack (16 Nov 2026):** 400 qualifying members and 4 "fresh"
members — the extra 200 + 3 were created by runs **before** the fixture became idempotent.
They are harmless (the test always uses the same first 200) and are kept: nothing is ever
deleted. 2400 entries in the fixture season.

### 2. Baseline fixture — `e2e/entries-api.spec.ts` (`baselines()`)

- Season **"M3 baseline fixture"**, championship, 1652-01-01 … 1652-01-28 (created once).
- Each run of the scoring-integrity test creates **one new client** (as every API test does)
  and gives it five baseline entries on 1652-01-10. That client is per-run test data like any
  other the suites create, not a growing fixture. Current stack: 15 entries (3 runs).

### 3. G-10 season fixture — `tests/db/seasons.test.ts`

- Seasons **"G-10 fixture"** (1653-01-01 … 1653-01-28) and **"G-10 empty fixture"**
  (1653-03-01 … 1653-03-28), one member **"G-10 fixture member"** (coach 3, `+201500000653`)
  and one pull-ups entry on 1653-01-20 in the first season. All created once, then reused.
- G-10 shrinks and extends **only these seasons**, never the shared seed season, and checks
  its prerequisite (the 1653-01-20 entry) before it attempts anything. Every change it makes is
  undone through the same audited admin update (an extension back to the original end).
- History: the earlier G-10 shrank the seed season and relied on entries dated "today". A run
  that started just after Cairo midnight (16 Nov 2026, 04:46) found none, the database correctly
  allowed the shrink, and the seed season was left ending on 15 Nov. It was restored with the
  admin season-extension API (see the M3 report).

### 4. Seasons scale fixture — `tests/db/participants-policy.test.ts` (`ensureScale()`)

- Guarantees at least **136 seasons and 74,000 `season_participants` rows** (the scale at
  which the coach's Seasons list timed out before migration 20261116000002).
- Creates something **only when the stack is below that scale**: first members
  (`Scale fixture <n>`, coaches 2 and 3, phones `+2012…`) up to 600 active, then far-past
  seasons `Scale fixture YYYY-MM` (one per month from 1660; every new season enrols all active
  members). Each is created only if its name does not exist yet.
- On the current test stack (136 seasons, 74,442 rows) it created **nothing**; on CI's fresh
  stack it builds the scale once per (disposable) run.
- `tests/db/row-limit.test.ts` uses the same `Scale fixture` members (coach 3) to keep more
  than 1000 **active** members on the stack, creating only the missing ones (none here: 1,011
  active), so the Members and Coaches lists are always tested past the API row limit.
- The dashboard test in `tests/db/row-limit.test.ts` keeps **more than 1000 non-voided entries
  dated today**: it tops today up (pull-ups, push-ups and deadlift for coach 3's `Rookie fixture`
  clients, logged by coach 3) only when today has 1000 or fewer, so it adds rows at most once
  per Cairo day. These are ordinary entries (with their automatic attendance) in the active season.
- Also one probe account **`policy-inactive@gym-arena.local`** (an inactive coach), created once
  and reused, to prove an inactive coach reads no participant rows.

### 5. Leaderboard tie fixture — `tests/db/leaderboard.test.ts` (`tieFixture()`)

- Reserved year **1654**. Five members `M4 tie A`–`M4 tie E` (coach 3; phones `+20154650000{0-4}`),
  created once by name **before** the seasons, so both seasons enrol them.
- Season **`M4 tie baseline`** (1654-01-01 → 1654-01-28): one pull-ups entry (5 reps) each on
  1654-01-10, which makes them non-rookies in the next season.
- Season **`M4 tie season`** (1654-03-01 → 1654-03-28): treadmill A 2.5 km, B 2.5 km (an exact
  tie), C 2.4 km, E 2.6 km (same displayed total 27 as A/B but a higher exact total); D nothing.
- Every insert is guarded by `where not exists`, so re-runs add nothing. Other members with older
  history also sit on that season's main board at 0 points; the test allows for them.

### 6. Leaderboard equivalence fixture — `tests/db/leaderboard.test.ts` (`equivFixture()`)

- Reserved year **1655**. Members `M4 equiv A`–`M4 equiv D` (coach 3; phones `+20154655000{0-3}`),
  created before three seasons: **`M4 equiv baseline`** (1655-01), **`M4 equiv season`**
  (1655-03) and **`M4 equiv after`** (1655-04).
- Entries (each guarded by `where not exists`): A — bench 100×3, 95×5 and a voided 120×5 plus
  pull-ups 5 and a voided 20 in January, bench 100×5 and pull-ups 8 in March, bench 200×5 in
  April; B — treadmill 3 km in January, push-ups 20 in March; C — treadmill 2 km in March;
  D — a voided pull-ups 9 in January, pull-ups 4 in March. The voids are done once, as the owner,
  with the reason "M4 equivalence fixture".

### 7. Closed-season (K1) fixture — `tests/db/leaderboard.test.ts` (`frozenFixture()`)

- Reserved year **1656**. Members `M4 frozen A`–`M4 frozen D` (coach 3; phones
  `+20154656000{0-3}`), created before seasons **`M4 frozen baseline`** (1656-01) and
  **`M4 frozen season`** (1656-03), so both enrol them (and every other member active then).
- A–C: pull-ups 5 on 1656-01-10; in March treadmill A 3 km, B 2 km, C 2 km; D (rookie) 1 km.
- "M4 frozen season" is **closed once**, through the real close contract (closer role,
  `begin_season_close` → `finish_season_close`), with results for every participant computed by
  the scoring module. Its `season_results` rows are immutable (no update, no delete).
- After the close, **B is deactivated once** (a deliberate post-closure status change). B stays
  inactive; the test proves the final board still ranks B as stored at close.

### Per-run data (not fixtures)

Tests that exercise the product create ordinary rows (clients, entries, seasons with random
far-future or far-past dates, audit rows) on every run, as the product would. They stay on the
stack (BR-E8) and every assertion is written to be independent of how many such rows exist:
counts are compared with the API, not with constants, and lists are searched by unique names.
