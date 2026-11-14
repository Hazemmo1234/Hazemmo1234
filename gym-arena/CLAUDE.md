# GYM ARENA — Instructions for Claude Code

You are implementing GYM ARENA, a monthly "Most Improved" gym championship with a live TV leaderboard.

## Source of truth
All product decisions are final and documented in `docs/`. **Do not make product decisions.** If something is not specified, check `docs/OPEN_DECISIONS.md`; if still unspecified, stop and ask.

Read in this order before coding:
1. `docs/PRODUCT_VISION.md`
2. `docs/BUSINESS_RULES.md`
3. `docs/SCORING_SPECIFICATION.md`
4. `docs/USER_ROLES_AND_PERMISSIONS.md`
5. `docs/DATABASE_SCHEMA.md`, `docs/SYSTEM_ARCHITECTURE.md`, `docs/API_SPECIFICATION.md`, `docs/SECURITY_SPECIFICATION.md`
6. `docs/UX_SCREEN_SPECIFICATION.md`
7. `docs/ACCEPTANCE_CRITERIA.md`, `docs/TEST_PLAN.md`
8. `docs/MVP_ROADMAP.md` — build milestone by milestone (M0 → M7)

## Non-negotiables
- TypeScript strict. No `any` in `modules/`.
- `modules/scoring` is pure (no I/O, no Date.now) and has 100% branch coverage; every example in SCORING §7 is a test.
- All "today" logic goes through `lib/time.ts` using `Africa/Cairo`. Never use the client clock for business rules.
- RLS on every table. Service-role key only in `server-only` modules.
- Entries are never hard-deleted (void only). Closed seasons are immutable.
- TV payload contains only the fields listed in API_SPECIFICATION (no phones, codes, evidence).
- Reference business rule IDs (e.g. `// BR-E6`) in code where the rule is enforced.
- Bilingual from the start (D15): every user-facing string comes from the `ar` / `en` message catalogs — no literals in components. Arabic is the default; direction follows the language. The TV uses its own language setting. Language never changes logic, scoring, permissions or data.
- Entries and attendance are written only by the server (D19). Take the acting user from the verified session, never from the request; the service role never skips business authorization.
- Closing a season happens only through the close operation: one transaction, season lock, results recomputed with `modules/scoring` (never in SQL), all-or-nothing (D21).
- Migrations (D22): edit-in-place + one local reset only until the first cloud deployment; add-only afterwards. Never run reset, seed or push against a linked or cloud database.
- A coach voids only entries they submitted, same day; Admin corrections need a reason and are audited (D26).
- The app lives in `gym-arena/`; do not touch the other project in this repository (D23).

## Workflow per milestone
1. Write/extend tests from ACCEPTANCE_CRITERIA first.
2. Implement.
3. Run lint, typecheck, unit + integration tests.
4. Summarize what was built, which ACs pass, and anything blocked.
