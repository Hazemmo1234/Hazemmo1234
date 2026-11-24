# GYM ARENA — Security Specification

This document consolidates the security model in one place (D24). It summarizes and points to the documents that hold the detail; it introduces no new product rules. **If this document and a referenced document ever disagree, the referenced document wins and this one must be corrected.**

Trust model (unchanged): coaches are fully trusted to report results honestly (PRODUCT_VISION, BR-E5). Security here means: staff see and change only what their role allows, history cannot be rewritten, closed seasons cannot change, and the TV shows only public fields.

## 1. Authentication and sessions
- Supabase Auth cookies are always `Secure` and `SameSite=Lax` (`src/lib/supabase/cookie-security.ts`):
  - **Staging and production (Vercel):** the platform variable `VERCEL=1` makes every auth cookie Secure without reading any request header. No request header is treated as trusted there.
  - **Any other production build** is Secure too. Next.js compiles `NODE_ENV=production` into the build, and nothing else enables the exception.
  - **The only exception:** a plain-HTTP request from and to this machine, on a server whose own configuration allows it. That means `next dev`, or the test-only flag `AUTH_COOKIES_ALLOW_LOCAL_HTTP=1`, which works only inside GitHub Actions (`GITHUB_ACTIONS=true`).
  - **How "from this machine" is decided:** on a self-hosted server the middleware's `request.nextUrl` is the server's own address (`http://localhost:<port>`), not the address the client used. So the request headers decide, and they can only remove the exception. Each of these keeps the cookie Secure:
    - a Host that is not a loopback name;
    - an `X-Forwarded-Host` that differs from Host;
    - an `X-Forwarded-Proto` other than `http`;
    - an `X-Forwarded-For` or `X-Real-IP` that is not a single loopback address;
    - any `Forwarded` header.
  - **Forged headers** can at most drop Secure from the sender's own cookies, and only on a dev or CI server.
  - **The browser client** uses the page's real address (`window.location`).
  - **Tests:** `tests/unit/auth-cookies.test.ts` (decision and wiring) and `tests/integration/auth-cookies.server.test.ts` (CI: the Set-Cookie real servers send, for each configuration).
- Supabase Auth, email + password. Accounts are created by the Admin only; public sign-up is disabled in every environment (D2, SYSTEM_ARCHITECTURE "Security").
- The server validates the session with the Auth service on every request; it never trusts unverified cookie contents.
- Every request also checks the staff profile: missing or inactive profile → signed out, no data (AC-1).
- **Deactivation (D28, BR-P7, M2):** block new sign-ins at the Auth level, revoke existing sessions as far as the platform supports, and keep the inactive-profile check on every server and database path. Access never depends on waiting for a session to expire. Reactivation lifts the block. History is kept.
- The TV has no user session: it presents the TV key (§3).
- Production settings to verify before launch: sign-up disabled, minimum password length ≥ 10 (TEST_PLAN pre-launch checklist).

## 2. Role-based authorization
- Roles and the full permission matrix: USER_ROLES_AND_PERMISSIONS.
- Route areas (`/admin/*` admin, coach routes for coaches, `/tv` by key) are navigation only; they are never the security boundary.
- "Own member" = the member's current coach. "Own entry" = the coach who submitted it (`logged_by`); it does not move when the member is reassigned (D26, BR-E9).
- Admin corrections (void, edit) require a reason and are audited (BR-E9, BR-E11).
- Language never affects permissions (BR-L6).

## 3. TV access
- `/tv?key=…`; key stored in `app_settings`, compared in constant time, regenerable by the Admin (D3).
- The TV state is built by the server from an explicit allow-list of fields (API_SPECIFICATION "TV", BR-X2). Never phones, member codes, notes or evidence. Photo only with consent, as a 1-hour signed URL (BR-P8).
- The key grants nothing else: no staff session, no write path.

## 4. Server-only write paths (D19, BR-X4)
- `entries` and `attendance` are written only through the authenticated API (API_SPECIFICATION "Entries"). Browsers have no insert/update permission on these tables.
- The acting user always comes from the verified session. No endpoint accepts an acting-user ID from the client.
- The server re-checks every rule before writing: role, own member / own entry, active season, Cairo date, one per day, photo rule (BR-E6), void window.
- Other tables that staff may write directly (members, seasons, participants, settings) stay protected by RLS and database rules (§5).

## 5. Database rules (RLS and integrity)
- RLS is enabled on every table; the policy summary is in DATABASE_SCHEMA "RLS summary". Anonymous clients can read nothing.
- Rules enforced in the database itself, independent of any API: one entry per member/category/day; coaches cannot change a member's coach or status; nothing is hard-deleted; `season_results` and `audit_log` are immutable; closed seasons are immutable; `season_id` of an entry cannot change; a season can be closed only by the close operation; the integrity guards listed in DATABASE_SCHEMA.
- Time-based rules use the Cairo date on the server and in the database, never the client clock.

## 6. Service role restrictions
- The service-role key exists only in server code (`server-only` module) and is never sent to the browser (CLAUDE.md non-negotiables).
- It is used for: curated reads that RLS deliberately does not allow (leaderboard for coaches, TV state), staff account creation, the server-only write functions, scheduled snapshots.
- It is a transport, not an authority: every service-role write carries the verified acting user, and the database functions apply that user's role rules. A service-role call with no acting user must not be able to create, edit or void entries.
- Even the service role cannot: reopen or directly close a season, insert an already-closed season, change frozen results, edit or delete audit rows, hard-delete entries.

## 7. Season locking and closing integrity (D21, D27)
- Sequence and guarantees: SYSTEM_ARCHITECTURE "Close & reveal"; rules BR-S5, BR-S7, BR-S10.
- Summary: authenticate Admin → one transaction on one connection → lock the season before reading → entry/attendance writes wait on the same lock → compute with the TypeScript scoring module (never SQL, D14) → verify one result per participant → write results and close atomically → any failure rolls back everything. Preseason: freeze only, no results, no winners. Championship close depends on M1.
- **Connection:** server-only secret `SEASON_CLOSE_DATABASE_URL`. It is read only by the close operation, never exposed to browser code (no `NEXT_PUBLIC_` prefix), never logged — connection errors are logged without the connection string.
- **Restricted role** `arena_season_closer` (created by the migrations as `NOLOGIN`), with only:
  - read: `seasons`, `season_participants`, `members`, `entries`, `attendance`
  - execute: `begin_season_close(season, admin)` and `finish_season_close(season, results)`
  - nothing else: **no direct write to any table** (results, the season row and the audit row are written by those two functions after their checks), no access to `profiles`, `app_settings`, `audit_log`, storage or Auth; no delete; no schema changes.
- `begin_season_close` re-checks that the acting user is an active Admin, takes the exclusive season lock and verifies the season has ended and is open. `finish_season_close` verifies it runs in the same transaction, validates completeness (results only for participants; **every** participant has one, active or not; members inactive at close carry no rank; none for a preseason), writes the frozen results and closes. Outside these functions nobody — including the service role and the database owner — can set `closed_at`, insert `season_results`, or create a season already closed.
- **Deployment step (not done yet):** enable login for the role with a strong generated password (`alter role arena_season_closer login password '…'`), and store the resulting connection string as `SEASON_CLOSE_DATABASE_URL` in the hosting provider's secret store. The exact pooling mode is chosen then; the requirement is a real transaction on a single connection.

## 8. Evidence and storage isolation
- Buckets `avatars` and `evidence` are private; paths and access are in DATABASE_SCHEMA "Storage"; rule BR-X3.
- A coach can read and upload only under their own members' folders; the Admin can read all. No one can overwrite or delete evidence through the client.
- Images are viewed through short-lived signed URLs issued by the server after an ownership check. The server never signs a path just because it is stored on a row: the path must sit under that member's folder.
- Uploads: size limit and image types enforced by the bucket; the declared type is not proof of content, so files are only ever served as images through signed URLs, never rendered as pages.
- TV never receives evidence (§3).

## 9. Audit logging
- What is logged: BR-E11 (Admin edit/void with reason, coach void, reassignment, season close), plus season extension, activation/deactivation, TV key regeneration (DATABASE_SCHEMA `audit_log`).
- Rows are written by the database/server, never by clients; they cannot be edited or deleted by any role.
- Every row has an actor. A privileged write without an identified actor is rejected rather than logged anonymously.
- Secrets are never written to the log (the TV key value is not recorded).

## 10. Seed and environment safety (D22)
- `supabase/seed.sql` is for local development and CI only. Its first statement aborts unless the database is a local Supabase stack (recognised by the well-known local development JWT secret) and has no accounts yet. Its demo accounts and passwords must never exist in the cloud project.
- Reset, seed and push commands are never run against a linked or cloud database. The CLI stays unlinked on development machines and in CI; the first cloud deployment is a deliberate, separate step.
- Migrations: edit-in-place only until the first cloud deployment, add-only afterwards (SYSTEM_ARCHITECTURE "Migrations").
- Secrets live only in git-ignored local files and in the hosting provider's secret store. `.env.example` holds names only. Local-stack development keys are not secrets and are never reused in the cloud.
- CI uses only the disposable local stack and holds no cloud credentials (D25, TEST_PLAN "Continuous integration").

## 11. Security testing requirements
- Required suites and gates: TEST_PLAN ("RLS tests", "Security regression tests", "Continuous integration").
- Every finding of the M0 audit that was reproduced on the local stack has a regression test that fails before the fix and passes after.
- Permission rules are tested from the attacker's side: as another coach, as a deactivated coach, as an anonymous client, and by calling the database directly without the API.
- Acceptance criteria that are security gates: AC-1–3, AC-7, AC-23, AC-26, AC-28, AC-39–50.
- Before launch: the pre-launch checklist in TEST_PLAN, including backups and production auth settings.
