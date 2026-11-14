# GYM ARENA (DFN Arena)

Monthly "Most Improved" championship + live TV leaderboard for DFN GYM.
Specs: `docs/` (source of truth) · instructions: `CLAUDE.md`.

## Stack
Next.js 15 (App Router, TS strict) · Tailwind v4 · Supabase (Postgres, Auth, Storage, RLS) · Vercel · PWA.

## Run locally
```bash
cd gym-arena
npm ci
npx supabase start          # needs Docker; first run pulls images
npm run db:reset            # applies supabase/migrations + supabase/seed.sql
cp .env.example .env.local  # fill with the values printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```
Seed logins (local only, password `Password123!`): `admin@gym-arena.local`, `coach1@…`, `coach2@…`, `coach3@…`.
TV (local): `/tv?key=dev-tv-key-0123456789abcdef0123456789abcdef`.

## Scripts
| Script | What |
|---|---|
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `test:coverage` | Vitest unit tests (CI) |
| `npm run test:db` | RLS + constraint tests against the local stack (run after `db:reset`) |
| `npm run test:e2e` | Playwright (coach mobile + 1920×1080 TV). Uses `npm run start`, so `npm run build` first |
| `npm run create-admin` | One-time first admin: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` + service env |

## Layout
See `docs/SYSTEM_ARCHITECTURE.md`. `src/modules/*` never import from `src/app/`; `modules/scoring` is pure.
