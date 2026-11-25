# GYM ARENA (DFN Arena)

Monthly "Most Improved" championship + live TV leaderboard for DFN GYM.
Specs: `docs/` (source of truth) · instructions: `CLAUDE.md` · security model: `docs/SECURITY_SPECIFICATION.md`.

## Stack
Next.js 15 (App Router, TS strict) · Tailwind v4 · next-intl (Arabic + English) · Supabase (Postgres, Auth, Storage, RLS) · Vercel · PWA.

## Run locally
```bash
cd gym-arena
npm ci
npx supabase start          # needs Docker; first run pulls images, applies migrations + seed
cp .env.example .env.local  # fill with the values printed by `npx supabase status`
npm run dev                 # http://localhost:3000
```
Seed logins (local only, password `Password123!`): `admin@gym-arena.local`, `coach1@…`, `coach2@…`, `coach3@…`.
TV (local): `/tv?key=dev-tv-key-0123456789abcdef0123456789abcdef`.

## Database safety
- `npm run db:reset` **drops and recreates the LOCAL database** (all local data is lost) and re-applies `supabase/migrations` + `supabase/seed.sql`. It never touches a cloud project as long as the CLI is not linked and no `--remote` / `--linked` flag is used. Do not link the CLI on a development machine.
- `supabase/seed.sql` refuses to run on anything but an empty local stack.
- Migrations: the three original files may be edited in place **only until the first cloud deployment**; after that, migrations are add-only (D22).

## Scripts
| Script | What |
|---|---|
| `npm run lint` / `typecheck` | ESLint (incl. "no literal text in components") / `tsc --noEmit` |
| `npm test` / `test:coverage` | Vitest unit tests |
| `npm run test:db` | RLS, write-path, season-close and seed-guard tests against the **local** stack. Refuses any non-local host |
| `npm run test:e2e` | Playwright (coach mobile + 1920×1080 TV, both languages). Uses `npm run start`, so `npm run build` first |
| `npm run create-admin` | One-time first admin: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` + service env |

## Languages
Arabic (default, RTL) and English (LTR). All text lives in `src/messages/{ar,en}.json` (identical keys, enforced by tests); components contain no literal text (enforced by lint). Staff language: profile → cookie → Arabic. The TV uses its own setting (`app_settings.tv_locale`).

## Writing data
Entries and attendance are written only through `src/modules/entries/server-writes.ts`, with a staff identity from `requireStaff()` (verified session). Browsers cannot write these tables. Season close goes through `begin_season_close` / `finish_season_close` as the restricted database role (see the security spec §7).

## Layout
See `docs/SYSTEM_ARCHITECTURE.md`. `src/modules/*` never import from `src/app/`; `modules/scoring` is pure.
