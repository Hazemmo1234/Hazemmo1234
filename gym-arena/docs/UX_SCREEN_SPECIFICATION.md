# GYM ARENA — UX & Screen Specification

Language: **Arabic UI, RTL**, Western digits (0–9), category names in English (gym vocabulary: Deadlift, Bench, Squat, Pull-ups, Push-ups, Treadmill). Coach screens are mobile-first (360–430 px). Admin is responsive (desktop-first). TV is 1920×1080 base, scaled to fit.

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

### Typography
Numbers and headings: a bold condensed italic sports face to echo the logo (e.g. "Barlow Condensed" 700/800 italic for Latin + "Cairo" 700/800 for Arabic). Body: "Cairo" 400/600. Tabular numerals for all scores.

### Motion
New best: row gets a red glow pulse (2×, 600 ms) + red "PR" badge. Podium #1: subtle gold shimmer every 10 s. Reveal: red curtain wipe, then gold burst for the champion.

### Logo placement
Login (centered tile, 96 px) · Coach/Admin header (32 px tile, left in RTL = right side) · TV top bar (tile 72 px + gym name + season name) · TV reveal intro (tile 240 px) · PWA icons.

---

## A. Coach (mobile)

### C1 Login
Email + password. Errors: wrong credentials, account inactive. Loading on submit.

### C2 Today (home)
- Header: season name + "X days left" (or "Preseason — logging baselines" / "No active championship — next starts DATE").
- Search by name.
- List of own active members: avatar, name, small row of 7 dots (filled = logged today), total points + rank (or "Rookie").
- Sort: logged today first (most recent on top), then alphabetical.
- FAB: "+ Add client".
- Empty: "No clients yet — add your first participant".
- Error: retry banner.

### C3 Member card
- Header: avatar, name, rank, total (big), "Rookie" badge if applicable.
- 7 tiles (2-column grid): category name, baseline → month best, points / max with thin progress bar, ✓ "Logged today" (tile disabled), "Building baseline" for rookie/no-baseline.
- "Attended today" button (disabled with ✓ if attendance exists).
- Consistency tile shows attended / planned and an edit-plan pencil.
- Footer link: "Today's entries" (list with Undo for same-day voids).
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

### A1 Dashboard
Cards: season status & days left · participants (active) · entries today · members with ≥1 entry this week (%) · new bests this season · Top 5 now · entries per category (bar) · coaches with clients logged today. Alerts: "Season ended — close it" (if today > ends_on and not closed), "No season scheduled for next month".

### A2 Seasons
List (name, type, dates, status). Create (suggests next calendar month). Edit/extend. **Close** button (only when ended) with confirmation summary of the final top 3. **Start reveal** button after close. View frozen results.

### A3 Members
Table: code, name, phone, coach, status, rank, total. Filters: coach, status, rookie. Actions: add, edit, reassign coach, activate/deactivate, view card.

### A4 Coaches
List, create (name, email, temp password), deactivate (blocked while they have active members → prompt to reassign).

### A5 Entries
Filterable log (date, coach, member, category, voided). Row actions: edit values, change date (within season), void with reason, view photo.

### A6 Audit log
Chronological, filter by action/actor.

### A7 Settings
Gym name, TV link with key (copy), regenerate key.

---

## C. TV (`/tv?key=…`)

### Modes
| Mode | When | Content |
|---|---|---|
| **Live** | active championship | Podium (Top 3) left 40% · ranks 4+ right 60%, 10 rows per page, auto-paging every 12 s · bottom ticker: recent new bests · top bar: season name, days left, live clock |
| **Preseason** | active preseason | Big countdown to Season 1 start · "Baselines logged: 87 / 120" progress · ticker of members who logged baselines |
| **Between** | ended (not closed) or no active season | "Results coming soon" + last standings frozen display; or countdown to next season |
| **Reveal** | closed + reveal_started_at set | Sequence: "THE CHAMPIONS OF <MONTH>" → 3rd (8 s) → 2nd (8 s) → "THE CHAMPION IS…" (4 s drumroll) → 1st with gold burst → final podium held |

### Row anatomy (live)
Rank number · movement arrow (▲2 green / ▼1 red / – ) · avatar · full name · total points (big, animated count-up) · gap to the person above (small, "-14").

### Behaviors
- Poll every 10 s; animate only when `version` changes.
- New best event → row red glow pulse + ticker item + red "PR" badge for 60 s.
- Position changes animate (FLIP, 600 ms ease-out). No flashing faster than 3 Hz.
- Readable at 5 m: names ≥ 40 px, points ≥ 56 px on 1080p.
- Network loss: keep last state, small "reconnecting" dot; never blank screen.
- Invalid key: plain "Display not authorized".
- Rookies: a compact strip under the main list ("Rookies of the month") showing top 5.
