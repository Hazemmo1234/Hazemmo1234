You are starting the GYM ARENA project from scratch in this repository.

> **Amendments (November 2026, approved by the owner — see `docs/OPEN_DECISIONS.md` D15–D23).** Where this prompt differs, the amendments win: (1) the app lives in `gym-arena/` inside the existing repository, not at the repo root; (2) the UI is Arabic **and** English (Arabic default, RTL/LTR, independent TV language); (3) entries and attendance are written only through server APIs; (4) before the first cloud deployment the original migrations are edited in place and the local database reset once — afterwards migrations are add-only; (5) M0 is not complete until the post-audit repair and bilingual foundation pass; (6) CI also runs build, database and E2E jobs on a disposable local stack (D25); (7) read `docs/SECURITY_SPECIFICATION.md` together with the other specs.

## 0. Context
- The repo root contains `CLAUDE.md`, `docs/` (13 product/tech specs) and `public/brand/` (DFN GYM logo + icons).
- All product decisions are final. Read `CLAUDE.md`, then every file in `docs/` in the order CLAUDE.md lists, before writing any code.
- Do not make product decisions. If something is missing, check `docs/OPEN_DECISIONS.md`; if still unclear, ask me.

## 1. Environment setup (do this first, ask me only for what you truly need)
1. Check installed tools: node (>= 20), npm/pnpm, git, Supabase CLI, Vercel CLI. Install the CLIs locally if missing (`npx supabase`, `npx vercel` are fine).
2. Scaffold Next.js (App Router, TypeScript strict, Tailwind, ESLint, `src/` dir) **in the existing repo root without deleting `CLAUDE.md`, `docs/`, or `public/brand/`**.
3. Supabase:
   - Run `supabase init` and set up local development (`supabase start`) if Docker is available; otherwise work directly against the remote project.
   - Ask me for: the Supabase project ref, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the database password if `supabase link` needs it.
   - Put secrets only in `.env.local` (git-ignored). Create `.env.example` with empty placeholders.
4. Vercel:
   - Ask me to run `vercel login` if needed, then `vercel link` to a new project named `gym-arena`.
   - Add the same env vars to Vercel (Production + Preview) with `vercel env add`, plus `CRON_SECRET` (generate a random one) and `APP_TIMEZONE=Africa/Cairo`.
   - Do the first deploy only after M0 passes.
5. Never print or commit secrets. Never put the service-role key in client code.

## 2. Build milestone M0 — Foundation (docs/MVP_ROADMAP.md)
- Project structure exactly as in `docs/SYSTEM_ARCHITECTURE.md`.
- Tailwind theme + CSS variables from the **Brand** section of `docs/UX_SCREEN_SPECIFICATION.md` (DFN red `#C42A1E`, dark theme, RTL, fonts Cairo + Barlow Condensed).
- PWA manifest using `public/brand/icon-*.png`, theme color `#C42A1E`, background `#0B0B0D`, app name "DFN Arena".
- Supabase migrations for **every** table, enum, constraint, index, trigger (member_code `GA-000001`), RLS policy and storage bucket in `docs/DATABASE_SCHEMA.md`. Apply them.
- `lib/time.ts` (Africa/Cairo "today"), Supabase server/browser/service clients (`server-only` for service).
- Auth: email/password login page (Arabic, RTL, logo), middleware with role-based route groups (`/admin/*` admin only, coach routes for coaches, `/tv` public with key), inactive users blocked.
- A one-time script `scripts/create-admin.ts` that creates the first admin user from env vars `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` (ask me for them; don't hard-code).
- `supabase/seed.sql` for local dev data as described in `docs/TEST_PLAN.md`.
- Tooling: Vitest, Playwright installed; scripts `lint`, `typecheck`, `test`, `test:e2e`.
- GitHub Actions CI: lint + typecheck + unit tests on every push.
- Deploy to Vercel and confirm the login page loads in production.

Stop at the end of M0 and report: what was built, how to run it locally, the production URL, and anything you need from me.

## 3. Then milestone M1 — Scoring engine
Only after I confirm M0:
- Implement `src/modules/scoring` as pure functions exactly per `docs/SCORING_SPECIFICATION.md`.
- Every example in SCORING §7 (A, B, C) becomes a unit test with exact values (±0.0001), plus the property tests in `docs/TEST_PLAN.md`.
- 100% branch coverage for the module. No UI.

Stop and report test results.

## 4. Working rules
- Follow `docs/ACCEPTANCE_CRITERIA.md`; reference rule IDs (e.g. `// BR-E6`) in code where enforced.
- Small, meaningful commits with clear messages. Work on a branch per milestone and open a PR into `main`.
- After each milestone: run lint, typecheck and tests; fix failures before reporting.
- UI text in Arabic **and English** (Arabic default; RTL/LTR), numbers in Western digits, category names in English. No literal user-facing strings in components.
