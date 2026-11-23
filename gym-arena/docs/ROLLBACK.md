# Rollback and recovery

Use the smallest step that fixes the problem. Production steps need the owner's approval, the
same as the action they undo.

## 1. Application (no data change): Vercel Instant Rollback
Vercel → production project → Deployments → the last good production deployment → **Instant
Rollback**. This serves the previous build immediately; nothing is rebuilt and the database is
untouched. Then:
1. So the next release does not bring the bad change back:
   1. Revert it on the feature branch with `git revert`. Never rewrite history.
   2. Wait for CI to pass on both runs.
   3. Fast-forward `release/gym-arena` to the revert commit (`docs/PRODUCTION_RUNBOOK.md` §3, GATE F).
2. Check with `npm run prod:verify -- https://<domain>`.

This is safe whenever the bad release added no migration, or added only add-only migrations
the old code ignores, which is the rule (D22).

## 2. Database migrations: roll forward
Migrations are add-only after the first cloud deployment (D22). A mistake is fixed by a **new**
migration, written, tested in CI and on staging, and then applied with `prod:migrate`. Never
use `db reset`, never edit an applied migration, and never run the seed in a cloud database.

## 3. Data recovery
Before any production migration or risky operation, run `npm run prod:backup`. It is a
read-only `pg_dump`, written to `backups/production-<timestamp>.dump` (git-ignored). Keep a
copy off the laptop.

| Source | What it covers | How |
|---|---|---|
| Supabase daily backups (Pro) | Whole database, last 7 days | Supabase → Database → Backups → Restore. This replaces the whole database, so it is for disaster recovery only. |
| Manual dump (`prod:backup`) | Whole database at that moment | Restore **selected data** into the same project. Example: one table's rows, `pg_restore --data-only --table=<t> --dbname=…` over `prod:psql`'s connection, after approval. Rehearse on **staging** first. |
| Storage (photos) | Not in database dumps | Supabase → Storage. Photos are evidence and avatars; keep the bucket objects. Deleted objects are not recoverable from the database dump. |

Closed seasons and frozen results are immutable by design (BR-S7). A wrongly closed season
cannot be reopened by the app; recovery would be a database restore. Do not improvise SQL
against production.

## 4. Secrets
If any secret may have leaked, rotate it and redeploy:
- the Supabase service key;
- the database password;
- the close-role password (`\password arena_season_closer` in `prod:psql`, then update `SEASON_CLOSE_DATABASE_URL`);
- `CRON_SECRET`;
- the TV key (Settings → Generate new key).

## 5. Rehearsal
Rehearse §1 and §3 on staging before launch:
1. Instant-rollback a staging deployment.
2. Take `npm run staging:backup`.
3. Restore one table's data with `pg_restore --data-only`.
4. Check the result.

Record it in `docs/RELEASE_HISTORY.md`.
