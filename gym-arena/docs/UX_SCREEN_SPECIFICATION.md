# GYM ARENA — UX & Screen Specification

Language: **Arabic (default, RTL) and English (LTR)** — see "Language & direction" below. Western digits (0–9) and category names in English (gym vocabulary: Deadlift, Bench, Squat, Pull-ups, Push-ups, Treadmill) in both languages. Coach screens are mobile-first (360–430 px). Admin is responsive (desktop-first). TV is 1920×1080 base, scaled to fit.

## Brand — DFN GYM (replaces the brief's navy/electric-blue direction)

Source: DFN GYM logo (red field, white italic "DFN", black dumbbell + "GYM"). Assets in `public/brand/`:
`logo-tile.png` (512, rounded, for headers/TV) · `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (PWA) · `logo-original.jpg`.
TODO for owner: provide SVG or transparent PNG of the wordmark for a sharper TV header (current assets are derived from a JPEG).

### Color tokens (Tailwind theme + CSS variables)
| Token | Hex | Use |
|---|---|---|
| `brand` | `#C42A1E` | Logo red. Primary buttons, active tab, TV header bar, podium accents. White text on it (5.7:1 ✓ AA) |
| `brand-hover` | `#A82217` | Pressed/hover state of brand fills |
| `brand-text` | `#FF5A4A` | Red **text or icons on dark backgrounds** (6.4:1 ✓). Never use `brand` for small text on dark (3.5:1 ✗) |
| `bg` | `#0B0B0D` | App + TV background (near-black, matches logo's black) |
| `surface` | `#17171A` | Cards, rows, sheets |
| `surface-2` | `#222226` | Inputs, hover rows, tiles |
| `border` | `#2E2E33` | Dividers |
| `text` | `#FFFFFF` | Primary text (19.7:1) |
| `text-muted` | `#A1A1AA` | Secondary text (7.7:1 on bg, 7.0:1 on surface) |
| `gold` | `#E3B341` | Rank 1 only (10.1:1) |
| `silver` | `#C9CED6` | Rank 2 only |
| `bronze` | `#D08A4E` | Rank 3 only |
| `up` | `#22C55E` | Rank ▲ movement, success toasts |
| `down` | `#FF5A4A` | Rank ▼ movement, errors (same as brand-text) |

Rules: red = brand energy and "live/new best" moments; gold/silver/bronze are reserved for the podium; green/red only for movement and status. Dark theme only in MVP.

### Language & direction (D15–D18, BR-L1–L6)
- Every screen exists in Arabic and English. No screen, state or message is Arabic-only or English-only.
- A visible **language switcher** (العربية / English) is on the Login screen and in the Coach and Admin headers. Switching applies immediately — text, direction and alignment — with no manual reload, and is remembered (profile for signed-in staff, cookie before sign-in).
- Direction: `rtl` for Arabic, `ltr` for English on the document. Layout uses start/end (logical) spacing so it mirrors automatically. Directional icons (back arrows, chevrons) mirror; rank-movement arrows (▲▼), numbers, weights and the logo do not.
- Dates and numbers are formatted for the selected language, always with Western digits. Units: `kg`, `km`, reps.
- Email, password and numeric inputs are always left-to-right.
- Not translated: member names, gym name, season names (shown as entered); category names (English).
- The TV uses its own language from Settings (A7), not the viewer's.

### Typography
Numbers and headings: a bold condensed italic sports face to echo the logo (e.g. "Barlow Condensed" 700/800 italic for Latin + "Cairo" 700/800 for Arabic). Body: "Cairo" 400/600. Tabular numerals for all scores.

### Motion
New best: row gets a red glow pulse (2×, 600 ms) + red "PR" badge. Podium #1: subtle gold shimmer every 10 s. Reveal: red curtain wipe, then gold burst for the champion.

### Logo placement
Login (centered tile, 96 px) · Coach/Admin header (32 px tile, left in RTL = right side) · TV top bar (tile 72 px + gym name + season name) · TV reveal intro (tile 240 px) · PWA icons.

---

## A. Coach (mobile)

### C1 Login
Email + password. Language switcher. Errors: wrong credentials, account inactive. Loading on submit.

### C2 Today (home)
- Header: season name + "X days left" (or "Preseason — logging baselines" / "No active championship — next starts DATE").
- Search by name.
- List of own active members: avatar, name, small row of 7 dots (filled = logged today), total points + rank (or "Rookie").
- Sort: logged today first (most recent on top), then alphabetical.
- "+ Add client": a primary button in the sticky search toolbar (it began as a floating button, which covered client rows on phones — `docs/PRODUCT_AUDIT.md` §5).
- Empty: "No clients yet — add your first participant".
- Error: retry banner.

### C3 Member card
- Header: avatar, name, rank, total (big), "Rookie" badge if applicable.
- 7 tiles (2-column grid): category name, baseline → month best, points / max with thin progress bar, ✓ "Logged today" (tile disabled), "Building baseline" for rookie/no-baseline.
- "Attended today" button (disabled with ✓ if attendance exists).
- Consistency tile shows attended / planned and an edit-plan pencil.
- Footer link: "Today's entries" (list with Undo for same-day voids). Undo appears only on entries this coach submitted (BR-E9); entries submitted by someone else are shown without it.
- States: closed season → tiles read-only with "Championship ended".

### C4 Entry sheet (bottom sheet)
- Lifts: weight input (numeric keypad, step 0.5) + reps chips [3][4][5].
- Pull-ups / Push-ups: big stepper + numeric input.
- Treadmill: km numeric (one decimal).
- **Live preview** (debounced 300 ms → `/api/entries/preview`): "e1RM 110.8 kg · New best! +72 pts" or "Not a new best — recorded, no points change".
- If `photo_required`: camera button becomes required ("Photo required for a new best"); save disabled until uploaded; upload progress shown.
- Save → success toast "+72 pts · Total 726" with **Undo** (voids entry).
- Errors: already logged today, no active season, validation messages inline, upload failed (retry).

### C5 Add / edit member
Fields: full name, phone, photo (camera/gallery) + consent checkbox "Client agrees to show photo on the gym TV", note under form: "Registering = client agrees to appear on the leaderboard by full name". Planned sessions (default 12).

### C6 Leaderboard (read-only)
Same ranking as TV in a list; own clients highlighted. Tabs: Main / Rookies.

### C7 History
Past seasons → final top 3 + own clients' final ranks.

---

## B. Admin (desktop + mobile-friendly)

Navigation: sidebar on iPad landscape and desktop, icon rail on iPad portrait, and on phones four tabs (Dashboard, Seasons, Members, Entries) plus "More" for Coaches, Audit log and Settings.

### A1 Dashboard
Cards: season status & days left · participants (active) · entries today · members with ≥1 entry this week (%) · new bests this season · Top 5 now · entries per category (bar) · coaches with clients logged today. Alerts: "Season ended — close it" (if today > ends_on and not closed), "No season scheduled for next month".

### A2 Seasons
List (name, type, dates, status). Create (suggests next calendar month). Edit/extend. **Close** button (only when ended) with confirmation summary of the final top 3. **Start reveal** button after close. View frozen results. For a preseason, Close confirms "baselines will be frozen" (no top 3, no reveal, no results — BR-S10). The season name is one field, shown as typed in both languages.

### A3 Members
Table: code, name, phone, coach, status, rank, total. Filters: coach, status, rookie. Actions: add, edit, reassign coach, activate/deactivate, view card.

### A4 Coaches
List, create (name, email, temp password), deactivate (blocked while they have active members → prompt to reassign).

### A5 Entries
Filterable log (date, coach, member, category, voided). Row actions: edit values, change date (within season), void, view photo. Every edit, date change and void asks for a reason (required) before saving (BR-E9).

### A6 Audit log
Chronological, filter by action/actor.

### A7 Settings
Gym name (one field, shown as typed in both languages), **TV language** (العربية / English, default Arabic), TV link with key (copy), regenerate key.

---

## C. TV (`/tv?key=…`)

Language: taken from the Admin's TV language setting (A7), delivered in the TV state; a running TV switches language and direction on its next poll. All TV text below is shown in that language.

### Modes
| Mode | When | Content |
|---|---|---|
| **Live** | active championship | Podium (Top 3) left 40% · ranks 4+ right 60%, 10 rows per page, auto-paging every 12 s · bottom ticker: recent new bests · top bar: season name, days left, live clock |
| **Preseason** | active preseason | Big countdown to Season 1 start · "Baselines logged: 87 / 120" progress · ticker of members who logged baselines |
| **Between** | ended (not closed) or no active season | "Results coming soon" + last standings frozen display; or countdown to next season |
| **Reveal** | closed + reveal_started_at set | Sequence: "THE CHAMPIONS OF <MONTH>" → 3rd (8 s) → 2nd (8 s) → "THE CHAMPION IS…" (4 s drumroll) → 1st with gold burst → final podium held |

### Row anatomy (live)
Rank number · movement arrow (▲2 green / ▼1 red / – ) · avatar · full name · [name tag] · total points (big, animated count-up) · gap to the person above (small, "-14").

Name tag (D34): only when another member shown has the same full name — a coach icon and the coach's name, or "#127" (short member number) when the coach does not tell them apart. Muted, smaller than the name; the name keeps priority when space is short. Shown wherever the name is: standings row (after the name), podium and winners (a line under the name, taken from the avatar's height so the layout keeps its size), rookies strip (beside the points), ticker (after the name).

### Behaviors
- Poll every 10 s; animate only when `version` changes.
- New best event → row red glow pulse + ticker item + red "PR" badge for 60 s.
- Position changes animate (FLIP, 600 ms ease-out). No flashing faster than 3 Hz.
- Readable at 5 m: names ≥ 40 px, points ≥ 56 px on 1080p.
- Network loss: keep last state, small "reconnecting" dot; never blank screen.
- Invalid key: "Display not authorized" (in the TV language) with the brand and one line on how to fix it; no data (`docs/PRODUCT_AUDIT.md` §5).
- Rookies: a compact strip under the main list ("Rookies of the month") showing top 5.
