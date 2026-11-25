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

Checked against the providers' own pages in November 2026. Prices change, so re-check the
[Vercel pricing](https://vercel.com/pricing), [Vercel Pro](https://vercel.com/docs/plans/pro-plan),
[Supabase pricing](https://supabase.com/pricing), [Supabase backups](https://supabase.com/docs/guides/platform/backups)
and [Supabase pausing](https://supabase.com/kb/faqs/platform/free-project-pausing) pages
before you subscribe.

| Provider facts | |
|---|---|
| Vercel Hobby | Free, but limited by Vercel's terms to personal, non-commercial use, with hard usage caps. A gym's member-facing app is commercial use. |
| Vercel Pro | $20/month platform fee, which includes 1 deploying seat and $20 of usage credit. Usage beyond the credit is billed on demand. Spend Management (a budget, optionally pausing projects at the limit) is included at no cost. |
| Supabase Free | $0. **No automatic backups.** The project is **paused after about a week of low activity** (data kept; restore from the dashboard). 2 active projects per account. |
| Supabase Pro | From $25/month per organization (includes $10 compute credit, enough for one Micro project). **Daily backups, 7 days kept**, never paused. Point-in-time recovery is a separate add-on (about $100/month for 7 days). |

**Cost decision**

| | Staging | Production |
|---|---|---|
| **Mandatory** | $0: Supabase Free, in its **own free organization** (a project inside a paid organization is billed about $10/month for compute). It may pause between test days; restore it from the dashboard | Vercel Pro **$20/month**; Supabase Pro **$25/month**; a domain (registrar price, typically ~$10–20/year). **About $45/month plus the domain** |
| **Recommended, no extra cost** | Host the staging Vercel project inside the same Pro team once production is on Pro. The platform fee covers several projects; staging usage counts toward the $20 credit. | Set a Vercel Spend Management budget with a hard limit (for example $40) so usage beyond the credit cannot surprise you |
| **Optional** | — | Point-in-time recovery (~$100/month), only if losing up to a day of entries is not acceptable; a free uptime monitor; extra Vercel seats for other people who deploy |

Until production exists, staging on Vercel Hobby is a grey area under Vercel's terms, because it
is a business's pre-release environment. Moving it into the Pro team removes the question.
Without Supabase Pro, the **only** production backup is `npm run prod:backup` (manual, before
every migration and at least weekly), and it does not include storage photos
(`docs/ROLLBACK.md` §3).

## 2. One-time setup — production (owner does each step; `→` = expected result)

**P1. Supabase project (GATE A: create a paid resource).**
1. In a **separate organization** from staging (upgrade that organization to Pro), create a new project named `gym-arena`, in the same region as staging.
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

**P3. Preflight (read-only, no network).** In a new terminal, on Node.js 22 LTS (every `prod:`
command refuses an older Node.js), run `npm ci && npm run prod:preflight`.
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
