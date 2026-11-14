# GYM ARENA — MVP Roadmap

## Must have (MVP = a complete monthly championship)
Everything in PRD FR-1 … FR-18.

## Build order (each milestone ends demoable + tested)
| # | Milestone | Contents | Depends on |
|---|---|---|---|
| M0 | Foundation | Repo, Next.js + TS strict + Tailwind (RTL + LTR), Supabase project, migrations for all tables/enums/RLS, seed, auth + middleware, CI (lint, typecheck, test). **M0 repair (post-audit):** server-only write path, close/season integrity guards, seed guard, security regression tests, bilingual foundation (i18n library, catalogs, switcher, locale on profile, TV locale setting), CI extended with build, database and E2E jobs (D25) | — |
| M1 | Scoring engine | Pure `modules/scoring` + full unit tests from SCORING §7. **No UI.** | M0 |
| M2 | Admin core | Coaches (incl. deactivation that blocks sign-in and revokes sessions — D28), members (+ codes, reassign, status), seasons (create/edit) | M0 |
| M3 | Coach logging | Today, member card, entry sheet with preview, photo rule + upload, attendance, undo | M1, M2 |
| M4 | Leaderboards | Leaderboard API, coach leaderboard, admin dashboard | M1, M3 |
| M5 | TV | `/tv` live mode, polling, animations, ticker, rookies strip, daily snapshot job | M4 |
| M6 | Season lifecycle | Preseason mode, preseason close (freeze baselines, no results), between mode, close → frozen results (transactional, recomputed with the scoring module — needs M1), reveal, history, audit log screen | M1, M4, M5 |
| M7 | Polish & launch | PWA manifest/icons, empty/error states, performance pass, E2E suite, gym TV test, coach training | all |

Suggested timeline for one developer with Claude Code: M0–M1 week 1 · M2–M3 week 2 · M4–M5 week 3 · M6–M7 week 4. Launch preseason at the start of week 5, Season 1 two weeks later.

Rule for every milestone: each screen and message ships in **Arabic and English** from the start (D15); there is no separate translation pass.

## Should have (right after launch)
- Supabase Realtime instead of polling.
- Member public profile link (QR) to see own breakdown.
- CSV export of season results.
- TV "member spotlight" slide.

## Nice to have
- Coach color/name on TV rows.
- Monthly highlights reel (top improvements) auto-generated for Instagram.
- WhatsApp message to winners.

## Future versions
- Member accounts and self-view.
- Check-in system integration for automatic attendance.
- Additional categories (plank, rowing, etc.) via configurable category table.
- Multi-branch / inter-branch championships.
- Seasonal "Hall of Fame".

## Risks
| Risk | Impact | Mitigation |
|---|---|---|
| Coaches don't log consistently | Board looks dead | Logging speed, dashboard "% logged this week", launch training |
| Veterans' improvement slows over months | Long-term members disengage | Monitor after 2–3 seasons; Treadmill + Consistency = 40% of points; consider season reset of baseline to "last 3 months best" later |
| Daily heavy lifts | Fatigue/injury | Coach programming; rep standards |
| Trust model abused | Credibility loss | Accepted by owner; audit log keeps history |
| Cairo DST/date bugs | Wrong-day entries | Single time helper + tests |
