# Release checklist

Tick each item with a date and evidence link. Production is deployed only when every box is
ticked, or its risk is accepted in writing, **and** the owner gives explicit written approval
for that release. Status values follow `docs/STAGING_ACCEPTANCE_REPORT.md`.

## 1. Before the first production release
- [ ] Release SHA chosen. Push CI and PR CI are green for **that exact SHA** (links).
- [ ] Unit, DB/RLS/security, build and E2E jobs passed; any skips are the device-project skips.
- [ ] Staging set up and verified (`docs/STAGING.md` A1–A11; `staging:verify` all PASS).
- [ ] Staging acceptance steps 1–45 PASS, with evidence (`docs/STAGING_ACCEPTANCE_REPORT.md` §5).
- [ ] Real phones (iPhone Safari, Android Chrome, one small screen) PASS, or risk accepted (`docs/REAL_WORLD_ACCEPTANCE.md`).
- [ ] Physical gym TV PASS, or risk accepted (`docs/REAL_WORLD_ACCEPTANCE.md`, `docs/TV_TEST_CHECKLIST.md`).
- [ ] Coach briefing held or scheduled (`docs/COACH_GUIDE.md`).
- [ ] Rollback rehearsed on staging (`docs/ROLLBACK.md` §5).
- [ ] Plans decided: Vercel Pro and Supabase Pro, or accepted otherwise (`docs/PRODUCTION_RUNBOOK.md` §1).
- [ ] Production Supabase project created; sign-ups off; minimum password 10 (GATE A).
- [ ] `npm run prod:preflight` all PASS; both refs compared by eye.
- [ ] `prod:backup` taken; migrations dry run shows the expected list; applied (GATE B).
- [ ] Close role enabled and 9 role checks as expected (GATE C).
- [ ] Production admin created; password in the password manager (GATE D).
- [ ] Vercel production project: Branch Tracking `release/gym-arena`, Ignored Build Step, 6 variables, no `NEXT_DIST_DIR`, domain added (GATE E).
- [ ] `APP_ORIGIN` = the final production domain.
- [ ] No unresolved critical/high security finding (`docs/STAGING_ACCEPTANCE_REPORT.md` §6, Supabase Advisors).
- [ ] PR #1 decision made: merge to the default branch, or keep releasing from the feature branch (owner).
- [ ] **Owner's written approval for this release: SHA, project and migrations named (GATE F).**

## 2. Release day
- [ ] `release/gym-arena` fast-forwarded to the approved SHA. Vercel shows that SHA as Production.
- [ ] `npm run prod:verify -- https://<domain>` all PASS.
- [ ] Admin sign-in, coach sign-in, and the TV link work. Settings shows the TV link with the production domain.
- [ ] Cron: first `GET /api/cron/snapshot` returned 200 (next day).
- [ ] Entry recorded in `docs/RELEASE_HISTORY.md`.

## 3. Every later release
- [ ] CI green for the exact SHA, on both runs.
- [ ] Same SHA deployed to staging and verified.
- [ ] New migrations? If yes: backup, dry run, owner approval, apply.
- [ ] Owner approval, fast-forward, `prod:verify`, smoke test, record.
