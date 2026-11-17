# Test fixtures on disposable test stacks

Some tests need database states the product itself can never create — above all **entries
dated before the active season** (baselines), and **more rows than the API returns in one
request** (`max_rows = 1000`). Those states are built as *fixtures*, written directly as the
database owner, on disposable stacks only.

## Where fixtures may exist

Only on a **disposable** stack positively identified as a test stack. The profile is declared
with `GYM_ARENA_TEST_STACK` (its name is the stack's Supabase project id) and then **proved from
the actual running resources** before any test can write:

| Profile | Stack | API / DB | Extra requirement |
|---|---|---|---|
| `gym-arena-ci` | the disposable stack each CI job creates (`scripts/disposable-stack.sh gym-arena-ci`, CI only) | 58321 / 58322 | explicit opt-in `GYM_ARENA_CI_DISPOSABLE=1` (set by the CI workflow on its test steps) |
| `gym-arena-fresh` | a fresh disposable local stack (no script creates it any more — see below) | 57321 / 57322 | — |

**Protected — never a write target:** the long-lived local stack `gym-arena-test` (56321 / 56322,
`scripts/test-stack.sh`) holds data that must survive. It has no profile, its name is refused
explicitly, its ports belong to no profile, and its containers do not match any profile's
identity. `scripts/test-stack.sh` has no reset command and its `env` output contains no test
write opt-in. The development stack (project `gym-arena`, 54321/54322) is never a write target
either. Cloud hosts and `https` URLs are refused. Generic flags (`CI`, `GITHUB_ACTIONS`)
authorize nothing in the target check.

### Where write-capable tests run

- **Write-capable tests run in CI.** `npm run test:db:isolated` and `npm run test:e2e:isolated`
  are disabled (they used to reset the protected stack) and only print why.
- **No local disposable-stack lifecycle:** `scripts/disposable-stack.sh` refuses
  `gym-arena-fresh` for every command, and manages `gym-arena-ci` only when
  `GITHUB_ACTIONS=true`.
- **Browser tests are CI-only:** they require `GITHUB_ACTIONS=true` and the `gym-arena-ci`
  profile. **`GITHUB_ACTIONS=true` is accident prevention, not authentication** — anyone can set
  it. It keeps an ordinary local run from writing; the protection of `gym-arena-test` does not
  depend on it (name, port and container identity refuse that stack in every case).
- **Remote browser mode (`E2E_BASE_URL`) is disabled.**

### How the guard works (central — no test can opt out)

1. **Declared profile** (`tests/support/write-target.ts`): known disposable profile, protected
   names refused, both URLs on localhost with exactly the profile's ports, the CI opt-in only
   with the CI profile.
2. **Actual stack** (`tests/support/stack-identity.ts`): the profile's containers
   `supabase_db_<project>` and `supabase_kong_<project>` exist, run, carry the CLI label
   `com.supabase.cli.project=<project>` and the expected images, publish exactly the profile's
   ports, keep the data in the volume `supabase_db_<project>`; the database reached through
   `TEST_DATABASE_URL` is the same cluster as the one in that container (Postgres
   `system_identifier`, read both ways) and uses the local development JWT secret; no cloud
   credentials are present. Anything that cannot be established (Docker unavailable, container
   missing, timeout, …) refuses the run.
3. **Built app** (`tests/support/build-attestation.ts`, browser suite): the Supabase address
   compiled into the build `next start` serves (`NEXT_DIST_DIR || .next`) is the verified one —
   in client and server code, with no other backend address anywhere — and the RUNNING server
   serves exactly that build (its `/_next/static/<BUILD_ID>/_buildManifest.js` and every client
   file carrying the address are fetched and compared byte for byte). Playwright starts the web
   server before global setup, so the check runs against the live server.
4. **Where it runs:**
   - DB suite: `tests/db/global-setup.ts` (steps 1–2 once), `tests/db/setup-guard.ts` (step 1 in
     every worker) and — independently of the runner configuration — `tests/db/helpers.ts`,
     which runs steps 1–2 with an **awaited** identity check before it creates any client. It is
     the only module in `tests/db` that creates database clients, and every DB test statically
     imports it, so a test's own code (including its dynamic imports of app modules) runs only
     after the check. `TEST_DB_ISOLATED=1` is required as well.
   - Browser suite: `e2e/global-setup.ts` and the worker-scoped automatic fixture in
     `e2e/fixtures.ts` (steps 1–3 plus the CI-only policy) run before any test; every spec must
     use `test` from `./fixtures`. `e2e/helpers.ts` refuses remote mode and runs step 1 when it
     is loaded. Tests tagged `@writes` (permanent rows) also need `E2E_ALLOW_WRITES=1` and call
     `requireWriteTarget()`; owner SQL goes through `ownerSql()`, which uses only the verified
     `TEST_DATABASE_URL`.
5. **A new test is protected automatically, and checked statically:**
   `tests/unit/e2e-import-graph.test.ts` (TypeScript parser, whole repository) fails if a file
   loads Playwright other than through `e2e/fixtures.ts`, a spec does not use `./fixtures`, a
   spec creates a client or signs in at load time, a DB test loads a client library directly or
   does not statically import `./helpers`. `tests/unit/write-guard-config.test.ts` fails if a
   test file sets or deletes the guard's environment variables or re-selects tests. These are
   CI-time checks (the unit job), not a runtime boundary.

`supabase/seed.sql` contains **no** fixtures.

Every test builds the data it needs. No test may rely on rows that other tests or earlier
runs left behind: on CI's fresh stack those rows do not exist.

## Why they are permanent

Rows can never be deleted (BR-E8: entries, members, seasons and the audit log have no-delete
triggers), so fixtures are created **once per stack and reused**. Every fixture is idempotent:
re-running a test reuses what exists and creates nothing. On CI they live only as long as the
job's own disposable stack. There is no script that resets a stack locally.

## Isolation from seed and from other tests

| Marker | Value |
|---|---|
| Dates | far in the past (1651–1657, 1660+): no overlap with seed seasons or any other test's seasons |
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

**State of the gym-arena-test stack on 16 Nov 2026 (historical record; that stack is now protected and no test writes to it):** 400 qualifying members and 4 "fresh"
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
- On the gym-arena-test stack (16 Nov 2026, before it became protected: 136 seasons, 74,442 rows) it created **nothing**; on CI's fresh
  stack it builds the scale once per (disposable) run.
- `tests/db/row-limit.test.ts` uses the same `Scale fixture` members (coach 3) to keep more
  than 1000 **active** members on the stack, creating only the missing ones (none here: 1,011
  active), so the Members and Coaches lists are always tested past the API row limit.
- The dashboard test in `tests/db/row-limit.test.ts` keeps **more than 1000 non-voided entries
  dated today**, from its own dedicated pool: at least 335 coach 3 clients `Today fixture NNNN`
  (phones `+20154659NNNN`), counted on their own so the pool never depends on other members or on
  test order. It tops today up (pull-ups, push-ups and deadlift for that pool, logged by coach 3)
  only when today has 1000 or fewer, so it adds rows at most once per Cairo day. These are
  ordinary entries (with their automatic attendance) in the active season.
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

### 8. Leaderboard scale fixture — `tests/db/leaderboard.test.ts` (`scaleFixture()`)

- Reserved year **1657**. Always at least **1,100 dedicated members** `M4 scale fixture NNNN`
  (coaches 1–3 in turn; phones `+20154657NNNN`) — counted on their own, never together with other
  members, so the result does not depend on the seed, other fixtures or test order. Missing ones
  are created after the highest existing fixture number.
- Seasons **`M4 scale baseline`** (1657-01) and **`M4 scale season`** (1657-03). Every fixture
  member is enrolled in the scale season explicitly (`on conflict do nothing`), even if created
  after the season.
- Results are a pure function of the member number `n`: pull-ups baselines for `n % 3 ≠ 0`, bench
  baselines for `n % 5 = 1` (the rest are rookies); in season pull-ups for everyone, bench progress
  for `n % 5 = 1`, treadmill for even `n`. Guarded by member + category + day.
- The scale test asserts: ≥ 1,100 fixture members; all of them enrolled; exactly the expected
  number of results; each one on the main board or — exactly when it has no pre-season result —
  the rookie list; most of them with points; and the optimized read ranking exactly like the
  full history at > 1,000 participants. The coach performance test uses the same season.

### 9. Consented-photo fixture — `tests/db/leaderboard.test.ts` (`photoFixture()`)

- Member **`M4 photo fixture`** of **coach 2** (phone `+201546580000`), created during the active
  season (so enrolled in it, BR-P4), with `photo_consent = true` and a tiny synthetic WebP avatar at
  `members/<member_id>/<uuid>.webp`, uploaded once with the service role. Reused when present.
- The test checks the object exists, the member row points at it, coach 2 can read it and coach 1
  cannot — then proves that coach 1's leaderboard never carries that member's id (D31).

### Per-run data (not fixtures)

Tests that exercise the product create ordinary rows (clients, entries, seasons with random
far-future or far-past dates, audit rows) on every run, as the product would. They stay on the
stack (BR-E8) and every assertion is written to be independent of how many such rows exist:
counts are compared with the API, not with constants, and lists are searched by unique names.
