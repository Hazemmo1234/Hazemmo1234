# Release history

Factual record of what was built, verified and deployed. An environment row appears only after
the deployment was confirmed by the platform.

## Deployments

| Date (Cairo) | Environment | SHA | CI (push / PR) | Migrations | Approved by | Result |
|---|---|---|---|---|---|---|
| — | staging | — | — | — | — | not deployed yet |
| — | production | — | — | — | — | not deployed yet |

## Development history (branch `claude/ecstatic-goodall-3p1zte`)

| Date | Commits | What |
|---|---|---|
| 2026-11-14 | `27ee5f5` … `75474d4` | M0 foundation (schema, RLS, auth, PWA, CI) and close-out; D29; M1 pure scoring engine |
| 2026-11-14/15 | `f37a24a` … `a4f180a` | M2 admin core: dashboard, seasons, coaches (Auth ban on deactivation), members |
| 2026-11-16 | `180e3aa`, `18d165b`, `bf4bd05` | M3 coach workflow; M4 leaderboards; CI stack hardening |
| 2026-11-17 | `2796ce1` | Phase A: database and browser test isolation |
| 2026-11-22 | `1fa63f3`, `39df918` … `f2ddbd5` | M5 TV and settings; M6 season close, reveal, results, history, audit; M7 states, scale, responsive, docs; E2E fixes |
| 2026-11-23 | `0a2c455` … `0480c0c` | Phone layout fix (Settings zoom-out); launch and coach docs |
| 2026-11-23 | `6386f33` … `382bf72` | Staging tooling: isolation preflight, guarded migrate/psql/admin, read-only verify, owner checklist |
| 2026-11-23 | `8d97f02` | Self-hosted Cairo and Barlow Condensed; builds no longer depend on Google Fonts |
| 2026-11-23 | `3fc086e` | Production-target operator tooling (`prod:*`), backups; runbook, rollback, release checklist, environment reference, real-world acceptance protocol (CI: push #55, PR #56 green) |
| 2026-11-24 | `2d0c423`, `407c7c3`, `b6b7b90` | Auth cookies `Secure` on HTTPS (fail-closed); behavioural API guard test; audit-path guard; create-admin enforces its target; strict `--target` parsing; cost decision; Supabase organization separation; local-HTTP cookie exception only with trusted server config (CI green: `2d0c423` push #57 / PR #58, `407c7c3` push #59 / PR #60, `b6b7b90` push #61 / PR #62; #62's E2E job was re-run once after the runner could not bind the CI database port) |
| 2026-11-24 | `31a4630` | Auth-cookie decision from the request headers: on a self-hosted server the middleware's URL is always the server's own address. The CI cookie flag works only inside GitHub Actions. New real-server cookie check in CI (`npm run test:cookies`) (CI green: push #63 / PR #64; cookie check 16/16 in both) |
| 2026-11-24 | `7cfbbd1` | TV podium: the #1 card no longer hides the leader's name (squeezed to 0 px) and points (below its clipped edge), and long names or ties no longer push final-podium winners off screen. Explicit size budget for the podium column; tied winners share the width. Geometry regression tests in `e2e/tv.spec.ts` (CI green: push #65 / PR #66; E2E 132 passed, 112 skipped) |
| 2026-11-24 | `1e5233a` | Names cut at their END in either script (`NameText`): a long Latin name in Arabic mode keeps its beginning, Arabic names stay right-to-left, short names are whole, lines keep the layout's alignment. 23 person-name sites (TV and staff screens). Browser geometry tests (`e2e/names.spec.ts`, `e2e/tv.spec.ts`) and a source guard (`tests/unit/name-text.test.ts`) (CI green: push #67 / PR #68; E2E 136 passed, 116 skipped) |
| 2026-11-24 | `8f212a7` | Operator tooling: close URL must use the Transaction pooler (port 6543); Node.js 22 guard for `staging:*`/`prod:*`; `APP_ORIGIN` docs (CI green: push #71 / PR #72) |
| 2026-11-25 | `33450a9`, `6a2bbc6` | UI/UX pass from the visual baseline (`docs/PRODUCT_AUDIT.md`): TV 10th row clear of the rookies strip, branded TV no-key screen, phone admin tabs + More, coach Add client in a sticky toolbar, dots legend, Arabic value direction, members table on iPad, branded 404, motion tokens. `33450a9` failed 12 E2E layout checks (dialog entrance scaled below 44 px; members test predated folded phone filters); fixed in `6a2bbc6` (CI green: push #75 / PR #76; E2E 140 passed, 122 skipped, 2 flaky made deterministic in the next commit) |

CI evidence per commit is recorded in `docs/STAGING_ACCEPTANCE_REPORT.md` §2 and the commit's
GitHub Actions runs.

## Incidents
None recorded.
