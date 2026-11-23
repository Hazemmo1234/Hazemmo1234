# Real-world acceptance (phones, gym TV, gym workflow)

Automated CI checks phone and TV layouts in an emulated browser. These checks need **real
devices in the gym**. They run on **staging** with the invented people from `docs/STAGING.md` §2,
never with real members. A result counts only when it was observed on the device, with
evidence. Never photograph a screen that shows a password, a key or the full TV link.

**Status:** every item below is **NOT RUN** until a row is filled in.

## 1. Devices
Fill in one row per device used.

| # | Device model | OS version | Browser + version | Screen (CSS px, from https://whatismyviewport.com) | Tester | Date |
|---|---|---|---|---|---|---|
| D1 | iPhone (any) | | Safari | | | |
| D2 | Android phone | | Chrome | | | |
| D3 | Smallest available phone (≤ 375 px wide) | | | | | |
| TV | The gym TV | | its browser / stick | | | |

## 2. Phone checks
Do these on D1, D2 and D3, in Arabic and in English. Use portrait; also landscape for P3 and P8.

| # | Step | Expected |
|---|---|---|
| P1 | Open the staging address; sign in as the staging admin | Sign-in works; Arabic is right-to-left; text is crisp Cairo, not a fallback font |
| P2 | Wrong password once | Clear error, still on sign-in |
| P3 | Every admin page: Dashboard, Seasons, Members, Coaches, Entries, Audit, Settings | No sideways scroll; nothing clipped or overlapping; bottom bar never covers buttons |
| P4 | Settings → scroll to the bottom → Copy link / Open TV / Generate new key | All fully visible and tappable (≥ 1 finger width) |
| P5 | Members → New member: type in each field | The keyboard does not hide the Save button after scrolling; Arabic and Latin input both work |
| P6 | Sign in as Coach One: Today → a member → log a result with a photo from the camera | Camera opens; photo attaches; result saved; Undo works |
| P7 | Turn on airplane mode, try to save, turn it off | Clear "no connection" style error; nothing saved twice; retry works |
| P8 | Add to Home Screen (iOS: Share → Add to Home Screen; Android: menu → Install app) and open it | Opens full-screen with the app icon; still signed in |
| P9 | Close the browser, reopen after 1 hour | Still signed in, or sent cleanly to sign-in |
| P10 | Switch language (ar ↔ en) | Whole screen flips direction and language at once |

## 3. Gym TV checks
Use the full list in `docs/TV_TEST_CHECKLIST.md`. Record here:

| # | Check | Expected |
|---|---|---|
| T1 | Open the TV link full-screen | Fills the screen; no scroll bars; nothing cut off at the edges (overscan) |
| T2 | Read from 5 m | Names, points and ranks readable in Arabic and English |
| T3 | Leave it on overnight | Next morning: still updating; no error screen |
| T4 | Unplug Wi-Fi 60 s, plug back | "Reconnecting" with the last board kept; recovers by itself |
| T5 | Ended season, before reveal | "Results coming soon"; **no standings** (D33) |
| T6 | Start reveal; reload the TV mid-way | 3rd → 2nd → champion → final podium; the reload resumes at the same step |
| T7 | Settings → Generate new key | Old link shows "Display not authorized" within about 10 s; new link works |

## 4. Gym workflow (with real staff, invented members)

| # | Scenario | Expected |
|---|---|---|
| W1 | Two coaches log results at the same time on their own phones for 10 minutes | Both succeed; each sees only their own clients; leaderboard and TV agree |
| W2 | Time one full entry (open member → weight × reps → photo → save) | Seconds per entry: record it. Target: under 30 s |
| W3 | A coach tries to open another coach's member, or an admin page | Refused |
| W4 | Admin corrects an entry with a reason | Saved; audit shows who, when and why |
| W5 | Gym Wi-Fi at a busy hour | Pages load; saves succeed or show a clear error with retry |

## 5. Evidence log

| Item | Device | Expected | Actual | Evidence (photo/video file name, no secrets) | PASS / FAIL |
|---|---|---|---|---|---|
| | | | | | |

## 6. Known limitations
- CI emulates phones in Chromium only. Safari and real Android Chrome are covered only here.
- The TV's built-in browser may lack features of current browsers. If T1–T7 fail on it, test a
  cheap streaming stick with Chrome before changing code.
