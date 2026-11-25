# Product audit, issue register and QA evidence — November 2026

Scope: the release candidate `8f212a7` (visual baseline 2026-11-24) and the UI/UX pass that
followed (`33450a9`, `6a2bbc6` and later commits on `claude/ecstatic-goodall-3p1zte`). Product
rules are unchanged: `docs/BUSINESS_RULES.md`, `docs/SCORING_SPECIFICATION.md` and the decisions in
`docs/OPEN_DECISIONS.md` were not touched. Nothing here ran against a cloud project.

Evidence locations (local, not in git): the baseline and after screenshots
(`evidence/baseline-2026-11-24/`, `evidence/after-2026-11-25/`), the real-user QA run
(`evidence/qa-2026-11-25/qa-results.json`) and performance measurements
(`evidence/perf-2026-11-25.json`) in the session scratchpad. The screenshot gallery was published
as a private claude.ai artifact.

## 1. Product inventory

Legend — **V**: complete and verified (real-user QA in a browser and/or CI end-to-end);
**T**: implemented, covered by CI tests but not exercised by hand in this pass; **L**: implemented,
insufficiently tested (needs real devices or long runs); **B**: blocked by infrastructure;
**U**: unclear requirement (needs an owner decision).

| Area | Screen / route | Workflows | Status |
|---|---|---|---|
| Sign-in | `/login` | sign in, wrong password, empty fields, language switch before sign-in, sign out / in again | V |
| Roles | middleware, `lib/routes.ts` | admin ↔ coach areas exclusive; signed-out → `/login`; APIs 401/403 | V |
| Admin dashboard | `/admin/dashboard` | season card, days left, stats, top 5, entries per category, alerts | V (view); alerts T |
| Championships | `/admin/seasons` | create / edit (T), close with confirmation (V), reveal (V), frozen results (V), preseason close (T) | V / T |
| Members | `/admin/members` | register (V), duplicate / invalid phone refused (V), edit (V), reassign + audit (V), activate/deactivate (T), filters (V) | V |
| Coaches | `/admin/coaches` | create (V), rename / deactivate with reassignment guard (T) | V / T |
| Results log | `/admin/entries` | filter, correct with reason (V), void with reason (V), change date (T), view photo (T) | V |
| Audit log | `/admin/audit` | corrections, voids, reassignments, closes listed (V) | V |
| Settings | `/admin/settings` | gym name (T), TV language (V via API), TV link masked + key rotation (T) | V / T |
| Coach Today | `/today` | own clients only, search, filter, legend, add client (T) | V |
| Member card + entry sheet | `/members/[id]` | live preview, save, one entry per category per day, auto attendance, same-day undo, mark attended, plan edit (T), photo rule (T) | V |
| Activity, leaderboard, history | `/today/activity`, `/leaderboard`, `/history` | open, read | V |
| TV | `/tv?key=` | live board + polling (V), wrong key (V), payload privacy (V), preseason / between / reveal modes (T, mocked states), long-running display (L) | V / T / L |
| Member-facing screens | — | none by design (PRODUCT_VISION non-goals) | n/a |
| PWA install | `manifest.webmanifest` | installable icon set | L (no device test) |
| Physical iPad / phone / TV | — | Safari/WebKit and real hardware | B (needs the owner's devices) |
| Staging / production | — | free staging plan in `FREE_STAGING.md` | B (needs the owner's accounts and approval) |

## 2. Issue register

Priority: **P0** security / data integrity / core function · **P1** major workflow failure ·
**P2** important UX, responsive or visual · **P3** polish. Status: **Fixed** (with the commit and
the test that guards it), **Open**, **Decision** (needs the owner).

| ID | P | Route | Issue | Root cause | Fix | Guarding test | Status |
|---|---|---|---|---|---|---|---|
| GA-01 | P1 | `/tv` | 10th standings row (rank 13, 23 …) hidden under the rookies strip | 10 × 66 px rows + strip > 824 px column; the list shrank | 64 px rows (58 px tall, 40 px names), compact strip, list `shrink-0` | `e2e/tv.spec.ts` geometry at 1080p and 720p | Fixed `33450a9` |
| GA-02 | P1 | admin, phones | Results, Audit, Settings off-screen in a sideways bar with no hint | 7 tabs × 76 px > 393 px | 4 tabs + "More" sheet | `e2e/admin-shell.spec.ts` phone test | Fixed `33450a9` |
| GA-03 | P2 | `/today`, phones | Floating "Add client" covered a client's points | `fixed` button over the list | Sticky search toolbar with Add client; rows pass under an opaque bar | `e2e/coach.spec.ts` "Add client never covers a client row" | Fixed `33450a9` |
| GA-04 | P2 | `/admin/entries` (ar) | "137 kg × 5" read "137 5 × kg" | `dir="ltr"` forced on an Arabic sentence | Screen direction; category in `<bdi>` | `e2e/m6-admin.spec.ts` direction + text | Fixed `33450a9` |
| GA-05 | P2 | `/members/[id]` (ar) | Treadmill "km credited" line scrambled | same as GA-04 | only the number pair is ltr | visual (after screenshots) | Fixed `33450a9` |
| GA-06 | P2 | `/admin/entries` | Championship filter cut at its start | six equal filter columns | 4-column grid, season and search span two | after screenshots | Fixed `33450a9` |
| GA-07 | P2 | `/admin/members`, iPad | Names and coaches cut, phone on two lines, placeholder cut | fixed columns took the width | code under the name below 1280 px, `nowrap` phone, two filter rows | `e2e/m6-admin.spec.ts` names whole, phones one line | Fixed `33450a9` |
| GA-08 | P2 | `/admin/members`, phones | Filters filled the first screen | all controls always shown | folded behind "Filters (n)" | `e2e/members.spec.ts` layout (opens the panel) | Fixed `33450a9`, `6a2bbc6` |
| GA-09 | P2 | `/admin/entries` | Red Void button on every row | `danger` fill | quiet text action; the reason dialog stays the confirmation | after screenshots; void flow in QA | Fixed `33450a9` |
| GA-10 | P2 | any unknown address | Unbranded English 404 | two root layouts, no not-found page | `global-not-found.tsx` + `(staff)/not-found.tsx`, in the staff language | `e2e/m6-admin.spec.ts` 404 heading + link | Fixed `33450a9` |
| GA-11 | P2 | `/today` | Seven dots without a legend | — | legend line | `e2e/coach.spec.ts` legend visible | Fixed `33450a9` |
| GA-12 | P2 | `/tv` without key | Small grey text only | — | brand, title, how to fix (TV language) | `e2e/tv.spec.ts`, `e2e/language.spec.ts` | Fixed `33450a9` |
| GA-13 | P2 | dashboard, member card | Empty grid cell; Consistency alone on its row | 3 stats in 2 columns; 7 tiles in 2/3 columns | 3 columns; Consistency spans its row | after screenshots | Fixed `33450a9` |
| GA-14 | P2 | coach screens, iPad landscape | Narrow centre column | `max-w-3xl` everywhere | wider containers; two-column client list | after screenshots | Fixed `33450a9` |
| GA-15 | P2 | `/members/[id]`, phones | Client name cut to "Mohamed …" | total + rank beside the name | total and rank on their own row; name may wrap | after screenshots | Fixed `33450a9` |
| GA-16 | P2 | `/tv` rookies | Rookie names cut | 5 columns, rank + avatar ate the width | rank on the avatar (~60 % more name width); long names still end in "…" | `e2e/tv.spec.ts` names | Fixed `33450a9` (partly — very long names are still cut) |
| GA-17 | P2 | `/tv` | Identical names cannot be told apart | the TV payload carries names only (BR-X2); coach names are deliberately not on the TV (OPEN_DECISIONS) | D34 (owner, 2026-11-25): coach name as a second identifier, else a short member number "#127"; shown after the name on the board, under it on the podium and winners, beside the points for rookies, after it in the ticker | `tests/unit/tv-payload.test.ts` (rule, ranks unchanged), `e2e/tv.spec.ts` (distinct tags in the live payload, geometry with tags) | Fixed (D34) |
| GA-18 | P3 | date inputs | Browser date control shows mm/dd/yyyy in Chromium | native control follows the device locale | — | real iPad check | Open (verify on device) |
| GA-19 | P3 | admin pages with `loading.tsx` | `notFound()` returns HTTP 200 with the 404 page (streaming already started) | framework behaviour with streaming | none needed (private app; the page is correct) | — | Open (accepted) |
| GA-20 | P3 | dialogs / pages | No entrance motion; no press feedback | — | motion tokens, rise + fade entrances, press feedback, reduced-motion respected | CI layout tests wait for motion (`motionSettled`) | Fixed `33450a9`, `6a2bbc6` |
| GA-21 | P3 | all (dev only) | Development "N" badge covered the last phone tab | dev indicator | `devIndicators: false` | — | Fixed `33450a9` |
| GA-22 | P3 | `/api/entries` (coach) | A `performed_on` sent by a coach is ignored (stored as today) rather than refused | server derives the date (BR-E3) | none — behaviour matches BR-E3 | QA probe: entry stored with today's date | Accepted |
| GA-23 | P3 | `/api/tv/state` at scale | 188 KB payload with ~1,300 participants (budget is 100 KB at 150 members) | payload grows with the board | none — within budget at the planned size (11 KB at 40 members) | perf measurement | Accepted (scale note) |
| GA-24 | P3 | `/admin/dashboard` (ar) | "Coaches who logged today" read "3 / 0" instead of "0 / 3" | number pair laid out right to left in the Arabic paragraph | value isolated as a left-to-right pair (like the tiles' "71 / 100") | after screenshots (re-captured) | Fixed `201b9d5` |

No P0 issue was found. Security and data-integrity checks are in §3.

## 3. Real-user QA (2026-11-25)

Run as a person would, in Chromium (Playwright), on the **disposable** local stack
`gym-arena-fresh` (app on port 3001) so the preserved development data stayed untouched. Admin on
iPad landscape in English, coach on an iPhone-size screen in Arabic, TV at 1920×1080.
**46 of 46 checks passed.** Browser console errors: only the expected 400 (wrong password),
422 (invalid input) and 404 (another coach's client).

- **Admin:** wrong password refused with a message; empty form not submittable; every section
  opens without horizontal overflow; member registered (`GA-001387`); duplicate and invalid phones
  refused; member renamed; coach created; member reassigned (audit row written); a result corrected
  with a reason (12 → 13 reps, audited); a result voided with a reason (row kept, marked, audited);
  void impossible without a reason; audit log lists the changes; an ended championship closed
  through the confirmation (1,110 frozen results); reveal started; frozen results page opens; TV
  language switched and restored; sign-out ends the session (`/api/me` → 401); sign-in again.
- **Coach:** Today in Arabic (RTL); Push-ups logged through the entry sheet with the live preview;
  the tile locks and a second entry is refused (409); attendance recorded once automatically; own
  entry undone the same day (kept as undone); attendance marked without a result; activity,
  leaderboard and history open; admin pages redirect to Today; admin APIs refuse (403); another
  coach's client is 404 and not writable; out-of-range values refused (422 × 3); signed-out APIs
  refused (401).
- **Authorization probes:** an entry dated inside a closed championship → 409 `NO_ACTIVE_SEASON`;
  a backdated coach entry is stored with today's date (BR-E3).
- **TV:** live board with the key, polls every 10 s (2 of 2 polls 200 in 23 s); wrong key →
  branded "not authorized", API 401; payload contains no phone number, member code or evidence.
- **Data integrity (SQL on the QA stack):** no member/category/day with two non-voided entries;
  no member/day with two non-voided attendance rows; every voided entry names who voided it.

CI on `6a2bbc6` (push run #75): lint, typecheck, unit tests with coverage; database/RLS/security
tests on a fresh stack; production build; browser suite **140 passed, 0 failed, 122 skipped**
(skips are by design: each spec runs on one project only), 2 flaky (dialog geometry measured
mid-animation — made deterministic with `motionSettled` in the next commit); real-server cookie
check 16/16.

## 4. Decisions needed from the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | Two members with the same full name look identical on the TV (GA-17). | Decided by the owner on 2026-11-25: coach name, else a short member number (D34). | Implemented. |
| Q2 | Hosting for free staging (Vercel Hobby is for non-commercial use only). | Netlify Free (commercial use allowed, never charged, hard credit limit) · Render Free (sleeps after 15 min, "not for production") · Vercel Pro (paid). | Netlify Free for staging — see `FREE_STAGING.md`. |

## 5. Design decisions taken in this pass (reversible, presentation only)

- UX C2 "FAB: + Add client" is realised as a **sticky toolbar button** next to the search: a
  floating button covered client data on phones. Same action, always reachable.
- Admin phone navigation: **four tabs + More** (Dashboard, Seasons, Members, Entries; More:
  Coaches, Audit log, Settings).
- UX C "Invalid key: plain Display not authorized" keeps that text and adds the brand and one line
  on how to fix it (no data shown).
- Motion: one easing family and three durations (`--dur-fast/base/slow` in `globals.css`); only
  translate and fade, so controls never render below their 44 px size; everything off under
  `prefers-reduced-motion`. TV motion keeps the timings of UX "Motion".
- No new dependency was added.

## 6. Performance (local production build, 40 members, 2026-11-25)

| Measure | Result |
|---|---|
| `GET /api/tv/state` (60 calls, 5 s cache forced to miss every 12) | p50 8.7 ms · p95 54 ms · max 175 ms |
| TV payload | 11.3 KB (2.1 KB gzip) |
| Admin pages (iPad, signed in, median of 4) | first byte 68–86 ms · load 119–146 ms · HTML 21–27 KB |
| First-load JavaScript | shared 103 KB; `/tv` 122 KB; `/today` 232 KB; `/admin/members` 227 KB |
| TV memory after 2 min of polling | 9.5 MB → 9.5 MB (no growth); 388 DOM nodes |

Cloud latency (Supabase in another region, cold functions) is not measured here; it is part of
the staging checklist.

## 7. Known limitations

- No physical iPad, phone or TV was used: all screens are Chromium emulation. Safari/WebKit
  rendering, the iPad date control (GA-18) and PWA install need the owner's devices.
- The TV was observed for minutes, not hours. A multi-hour run on the real TV belongs to staging
  acceptance (`TV_TEST_CHECKLIST.md`).
- English staff screens were checked through the language switch and the QA run; the screenshot
  set is Arabic-first like the baseline.
- Staging is not deployed: it needs the owner's accounts and approval (`FREE_STAGING.md`).
