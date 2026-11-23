# Production runbook

How GYM ARENA goes live and is released afterwards. Production uses its **own** Supabase
project, Vercel project, domain, secrets and admin account; nothing is shared with staging.
Each **GATE** needs the owner's explicit written approval for that step. An approval for
development or staging work never covers a production step. Variable details are in
`docs/ENVIRONMENT_VARIABLES.md`; rollback is in `docs/ROLLBACK.md`.

## 0. Preconditions (all from `docs/RELEASE_CHECKLIST.md` §1)
- Staging acceptance passed (`docs/STAGING_ACCEPTANCE_REPORT.md`).
- Real-world checks passed, or their risks were accepted in writing (`docs/REAL_WORLD_ACCEPTANCE.md`).
- The release commit is green on **both** CI runs (push and PR) for that exact SHA.

## 1. Plans and costs (owner decision, before anything is created)

| Service | Recommended for production | Why |
|---|---|---|
| Vercel | **Pro** | Vercel's terms limit Hobby to personal, non-commercial use. A gym's member-facing app is commercial use. |
| Supabase | **Pro** (from $25/month) | Free has no automatic backups and pauses after a week of low activity. Pro: daily backups kept 7 days, never paused. Point-in-time recovery is a paid add-on and optional. |

Staging can stay on free tiers. Check the current prices on the providers' pricing pages
before you subscribe.

## 2. One-time setup — production (owner does each step; `→` = expected result)

**P1. Supabase project (GATE A: create a paid resource).**
1. Create a new project named `gym-arena` (not the staging one), in the same region as staging.
2. Generate a new database password (letters and digits), and keep it in your password manager.
3. Authentication:
   - Sign-ups **off**.
   - Minimum password length **10**.
   - Site URL = the production domain.
4. → Note the project ref: it is the `xxxx` in `https://xxxx.supabase.co`.

**P2. Operator file.** In `gym-arena/`, copy `.env.production-ops.example` to
`.env.production-ops` and fill it in:
- the production ref;
- the **staging** ref (it is refused everywhere);
- the URL and keys;
- the owner Session-pooler URI as `PRODUCTION_MIGRATION_DATABASE_URL`;
- a **new** `CRON_SECRET`;
- `APP_ORIGIN=https://<final domain>`;
- `ADMIN_EMAIL` and `ADMIN_NAME`.

Prefer the legacy `anon` / `service_role` keys if offered: the check can then prove which
project they belong to.

**P3. Preflight (read-only, no network).** In a new terminal, run `npm ci && npm run prod:preflight`.
→ Every line PASS, and the two refs match the two dashboards.

**P4. Migrations (GATE B: production database change).**
1. `npm run prod:backup`. It is read-only; on a new project the dump is nearly empty.
2. `npm run prod:migrate`. This is the dry run. → It lists exactly the 8 migration files in `docs/STAGING.md` step 4.
3. After approval, run `npm run prod:migrate -- --apply`. → The command asks you to **type the production ref**, then applies the migrations.
4. In `npm run prod:psql`, run the read-only checks from `docs/STAGING.md` step 4. They expect the same counts, with `auth.users` = 0.

**P5. Restricted close role (GATE C: production role and credential).**
1. In `npm run prod:psql` (type the ref), run `alter role arena_season_closer login;` then `\password arena_season_closer`.
2. Run the 9 role checks from `docs/STAGING.md` step 5.
3. Set `SEASON_CLOSE_DATABASE_URL`: Transaction pooler, `arena_season_closer.<prod-ref>`, port 6543.
4. Run `npm run prod:preflight` again. → All PASS.

**P6. First admin (GATE D: production account).** `npm run prod:create-admin`. You type the
ref, then the password twice; nothing is shown. → `Admin created: <email>`. Store the
password in your password manager.

**P7. Vercel production project (GATE E: production hosting and secrets).**
1. Create a **new** Vercel project named `gym-arena`, importing the same repository.
2. Root Directory: `gym-arena`. Framework: Next.js.
3. **Release gate:** set Environments → Production → Branch Tracking to `release/gym-arena`. Nothing else deploys to production.
4. Settings → Git → Ignored Build Step, so preview builds never run in this project:
   `if [ "$VERCEL_GIT_COMMIT_REF" = "release/gym-arena" ]; then exit 1; else exit 0; fi`
   (exit 1 = build, exit 0 = skip).
5. Environment Variables, Production scope, Sensitive:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SEASON_CLOSE_DATABASE_URL`
   - `CRON_SECRET`
   - `APP_ORIGIN`

   Copy all values from `.env.production-ops` **after** a passing preflight. Never set
   `NEXT_DIST_DIR`, owner URLs, `*_SUPABASE_REF` or `ADMIN_*`.
6. Domains: add the production domain. DNS records are created by the owner at the registrar.

**P8. First release (GATE F: production deployment).** Release procedure §3, with the approved SHA.

## 3. Release procedure (every release)
1. **Pick the SHA.** It must be on the feature branch with push CI **and** PR CI green for that exact SHA. Record both links.
2. **Staging first.** The same SHA is deployed to staging (staging tracks the feature branch). `npm run staging:verify -- <staging-url>` passes, and the relevant acceptance steps were re-run.
3. **Migrations?** Compare the migrations at the SHA with those already applied in production (`npm run prod:migrate`, dry run).
   - New migrations are add-only (D22).
   - If any exist: `npm run prod:backup`, then GATE B, then `-- --apply`.
4. **Release (GATE F).** Point `release/gym-arena` at the SHA (`git push origin <sha>:refs/heads/release/gym-arena`, a fast-forward only; never force). Vercel builds and deploys that commit. → The deployment shows the SHA and "Production".
5. **Verify.**
   - `npm run prod:verify -- https://<domain>` → all PASS: the CSP names only the production project, sign-up is off, anonymous access is refused, and unauthenticated API calls get 401.
   - Then the smoke test: admin sign-in; a coach sign-in; the TV link opens the board.
6. **Record** the release in `docs/RELEASE_HISTORY.md`: date (Cairo), SHA, CI links, migrations, who approved.

## 4. Post-launch monitoring (first 24 h, then weekly)

| What | Where | Healthy |
|---|---|---|
| Availability | Open `/login`; optional free uptime monitor on it | 200 |
| Server errors | Vercel → Project → Logs (filter 5xx) | none, or explained |
| Auth errors | Supabase → Logs → Auth | no bursts of failures |
| Database | Supabase → Reports / Logs → Postgres | no connection errors; disk well below the plan |
| Cron | Vercel → Logs, `GET /api/cron/snapshot` once a day | `200 {"ok":true,…}` |
| TV | the gym screen | board updates; no "Reconnecting" that lasts |
| Season close (monthly) | Admin → Audit log | exactly one "Championship closed" per season |
| Security | Supabase → Advisors (security/performance) | no new critical findings |

## 5. Incident response
1. **Is data at risk?** A wrong season closed, data loss, or a leak: stop changes and do not close or reveal anything further. Take `npm run prod:backup` immediately.
2. **Is it the new release?** Vercel → Deployments → previous production deployment → **Instant Rollback**. `docs/ROLLBACK.md` §1.
3. **Leaked key or secret?**
   - Rotate it in Supabase (API keys / database password), the close-role password, or the cron secret.
   - Update Vercel, then redeploy.
   - Rotate the TV key in Settings if the TV link leaked.
4. **Write down** the time, symptom, actions and outcome in `docs/RELEASE_HISTORY.md`.
