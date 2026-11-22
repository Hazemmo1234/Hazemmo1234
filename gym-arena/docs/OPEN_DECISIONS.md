# GYM ARENA — Open Decisions & Defaults Taken

The owner asked Claude to finalize the remaining details. These are the defaults chosen. Each can be changed later; Claude Code must implement the default, not invent alternatives.

## Changed from the original brief (owner should know)
| Brief said | Implemented as | Why |
|---|---|---|
| 9 categories, 900 pts, equal weight | 7 categories, 1000 pts, weighted | Discovery decisions Q13, Q16, Q17 |
| Coaches submit, Admin approves | Auto-approve; Admin can void/edit until close | Full trust (Q50) |
| Video/photo evidence per challenge | Photo only when points increase | Q39, Q61 |
| Mutable points ledger | Append-only entries + derived scores + frozen results at close | Same auditability, simpler and impossible to drift |
| Coach color on leaderboard | Not shown on TV in MVP | Coach ranking removed (Q46); avoids implying coach competition |
| Notifications | Not in MVP | No member accounts; coaches see everything in-app |
| Navy + electric blue + gold palette | DFN GYM brand: logo red `#C42A1E` + near-black + white; gold/silver/bronze kept for podium only | Owner asked to use the gym's logo colors |

## Defaults chosen by Claude (no owner input yet)
| # | Topic | Default |
|---|---|---|
| D1 | UI language | **Superseded by D15.** Arabic (default, RTL) + English (LTR); Western digits and English category names in both languages |
| D2 | Coach login | Email + password created by Admin |
| D3 | TV access | Secret key in URL, regenerable |
| D4 | TV refresh | Polling every 10 s |
| D5 | Missing baseline in one category (non-rookie) | That category = 0 this season |
| D6 | Attendance above plan | Capped at 100% (max 200 pts) |
| D7 | Coach can backdate | No; Admin can within the active season |
| D8 | Season close | Manual by Admin after `ends_on`; logging auto-locks at midnight |
| D9 | Rank arrows | Change since start of today (Cairo) |
| D10 | Ties in Top 3 | Shared rank; all tied shown as winners |
| D11 | Rule/formula changes | Code constants; changed only between seasons |
| D12 | Phone | Required, unique, Egyptian mobile |
| D13 | Images | Compressed client-side to ≤1280 px WebP |
| D14 | Scoring engine | TypeScript pure module (server-side), not SQL |

## Decisions approved by the owner after the M0 audit (November 2026)
These are final. The original product model (7 categories, 1000 weighted points, Most Improved, rookies, auto-approval, photo rule, attendance rules, season lifecycle, DFN brand) is unchanged. No approval queue, no extra categories.

| # | Topic | Decision |
|---|---|---|
| D15 | Bilingual application | The whole application supports **Arabic and English**. Arabic is the default. Arabic renders RTL, English LTR, applied at document and component level. Every user-facing string (screens, forms, navigation, validation, errors, empty/loading states, dashboards, settings, TV) is translated. Dates and numbers follow the selected locale, always with Western digits (0–9) and the Africa/Cairo calendar day. Category names stay in English in both languages. Switching language never changes business logic, scoring, permissions or stored data. Every milestone ships both languages from the start. |
| D16 | Staff language preference | Stored on the staff profile (`profiles.locale`). A cookie is the fallback for the login page and initial resolution. Resolution order: profile → cookie → Arabic. |
| D17 | TV language | The TV has its **own independent language setting** (`app_settings.tv_locale`, default Arabic), set by the Admin in Settings. It never follows a signed-in user's language or cookie. |
| D18 | Gym and season names | One name field each. Shown exactly as the Admin typed it in both languages. No separate translated name fields. Member names are never translated. |
| D19 | Server-only writes | All writes to `entries` and `attendance` go through authenticated server-side APIs. Clients have no direct insert/update permission on these tables. The server derives the acting user from the verified Supabase Auth session; a user ID supplied by the client is never trusted. Every business authorization rule is re-checked on the server, and the service role is never a way around those rules. BR-E6 (photo rule) is enforced on this path. |
| D20 | Preseason closure | The Admin can close a preseason through the normal close operation. Closing freezes its baseline data (the season becomes immutable). It creates **no winners and no `season_results` rows**. |
| D21 | Season close architecture | Scoring formulas stay in the one TypeScript module (D14); they are never duplicated in SQL. Close is a trusted server operation: authenticate the Admin → one PostgreSQL transaction on one connection → lock the season → read authoritative data → compute with the scoring module → verify one result per participant → write frozen results and close atomically. Entry and attendance mutations coordinate with the same season lock. Any failure rolls back everything. Full championship close depends on M1 scoring being implemented and tested. |
| D22 | Migration strategy | Before the first cloud deployment: the three original migration files are edited in place, followed by one controlled reset of the disposable **local** database and re-verification. After the first cloud deployment, migrations are permanently add-only. |
| D23 | Repository layout | The application stays in `gym-arena/` inside the existing repository (which also holds an unrelated project). It is not moved to a separate repository. Work happens on one branch per milestone with a PR into `main`. |

| D24 | Security specification | `docs/SECURITY_SPECIFICATION.md` consolidates the security model. It is an index and summary: where it and another document describe the same rule, the other document (BUSINESS_RULES, USER_ROLES, DATABASE_SCHEMA, SYSTEM_ARCHITECTURE, API) holds the detail and wins. |
| D25 | Database tests in CI | GitHub Actions also runs the DB/RLS suite on an isolated, disposable local Supabase stack built from clean migrations, plus build and E2E checks, alongside the existing lint, typecheck and unit jobs. CI has no access to any cloud project. Approved requirement; implemented in the M0 close-out. |
| D26 | Coach void ownership | A coach may void only an entry **they submitted** (`logged_by`), same day only. Reassigning a member does not transfer ownership of existing entries to the new coach. Admin corrections (void or edit) require a mandatory reason and are always audited. Supersedes the earlier "own members" reading. |
| D27 | Database connection for season close | The close operation uses a server-only PostgreSQL connection with a restricted role (`SEASON_CLOSE_DATABASE_URL`). See SECURITY_SPECIFICATION §7. The secret is not created until deployment. |
| D28 | Deactivated coaches | On deactivation: block new sign-ins at the Auth level, revoke existing sessions as far as the platform allows, and keep the inactive-profile check on every server and database path. History and audit records are kept. Implemented in M2 with regression tests. |
| D29 | Inactive participants at close | Every season participant gets a frozen result at close, **including members who became inactive during the season**; their points are computed with the same formulas as everyone else. Inactive members stay excluded from live leaderboards, from ranking and from the podium: their frozen result has no rank (`rank` and `rookie_rank` are empty) and they can never be a winner. Their historical result is preserved. No scoring or participation rule changes. |
| D30 | Leaderboard of a closed season | **Owner decision (M4 review, K1).** A closed season's leaderboard shows the **frozen final results** stored at close (`season_results`): ranks, rookie ranks and points exactly as written by the close operation, flagged `final: true`. It is never recomputed, so later edits, member-status changes or coach reassignments cannot alter historical standings. Members inactive at close stay unranked and off the board (D29); members deactivated *after* the close keep their final rank. Names, coach names and photos are current display data under the usual privacy rules. A closed preseason has no results (D20). |
| D31 | Photos on the staff leaderboard | **Owner decision (M4 review, K2).** A coach receives signed photo URLs **only for their own clients**; everyone else on a coach's board shows initials. Reason: a signed avatar URL embeds the storage path `members/<member_id>/…` and would reveal the member id that the board masks. The admin receives photos for all consented members (BR-P8 still applies to everyone). |
| D32 | Dashboard activity window | **Owner decision (M4 review, K3).** "Members with ≥1 entry this week" (UX A1) is computed over the **last 7 Cairo calendar days, today included** (today − 6 … today), and is labelled "last 7 days" / «آخر 7 أيام» in both languages. Denominator: the season's active participants. |

## Still open (decide before launch, none block M0–M5)
- **TV between seasons — show standings before the reveal?** UX C lists "last standings frozen display" for the Between mode. Implemented default (M5): the TV shows "Results coming soon" (and a countdown when a next season is scheduled) but **no standings** of an ended championship until the Admin starts the reveal — the provisional ranking of an ended, unclosed season is not final, and showing the frozen podium before "Start reveal" would give the reveal away. If the owner prefers the standings, it is a small change in `modules/tv/payload.ts` (`resolveTvMode`) and `modules/tv/state.ts`.
- Exact prize announcement text and who hands prizes (outside system).
- SVG / transparent PNG of the DFN GYM wordmark (current brand assets derived from a JPEG — usable, but a vector is sharper on the TV).
- Domain name.
