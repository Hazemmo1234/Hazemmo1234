# Gym TV — on-site test checklist

To be done **on the actual gym TV**, before launch and after any TV hardware/browser change.
Nothing in this list can be verified by CI; record the date, the person and the result.

## Setup
- [ ] Admin → Settings → **Open TV** (or copy the link) — open it on the TV's browser in full-screen / kiosk mode.
- [ ] Browser does not sleep, show pop-ups or auto-update during opening hours; screen saver off.
- [ ] Note the TV's resolution and aspect ratio: ____ × ____ (base design is 1920×1080; other ratios are letter-boxed, never cropped).
- [ ] TV language (Settings) is the one the gym wants; switching it changes the running TV within ~10 s.

## Readability (stand 5 m away)
- [ ] Names (≥ 40 px at 1080p) and points (≥ 56 px) readable from 5 m, in Arabic and in English.
- [ ] Podium with the gym's longest real names in the top 3: every podium card shows its name (long names end in "…") and its points in full.
- [ ] Gold / silver / bronze and the red brand bar distinguishable on this panel (check in daylight and evening light).
- [ ] Photos (consented members only) not stretched; members without consent show initials.
- [ ] Movement arrows ▲ (green) / ▼ (red) visible; colour is not the only cue (arrow + number).

## Live behaviour
- [ ] A coach logs a result → it appears within ~15 s; a new best shows the red glow + "PR" badge for ~60 s and in the ticker.
- [ ] Page change every 12 s is smooth; nothing flashes faster than 3 times per second.
- [ ] Unplug the network for 60 s → last board stays, a small "Reconnecting" dot appears → plug back → it recovers by itself.
- [ ] Refresh the browser (F5) → the board returns without a blank screen.

## Season moments
- [ ] Preseason: countdown and "Baselines logged X / Y" progress.
- [ ] Ended season: "Results coming soon"; no standings shown before the reveal.
- [ ] Reveal (Admin → Championships → **Start reveal**): intro → 3rd (8 s) → 2nd (8 s) → "The champion is…" (4 s) → champion with gold burst → final podium held. On the final podium, every winner's name and points are on screen (also when a tie gives one place several winners).
- [ ] Refresh the TV in the middle of the reveal → it continues at the right step.
- [ ] Sound/lighting cue for the reveal, if the gym wants one (outside the system).

## Security
- [ ] After Settings → **Generate new key**, the old link shows "Display not authorized" on its next refresh; open the new link on the TV.
- [ ] The TV link is not posted anywhere public.

| Date | Tested by | TV model / browser | Result / notes |
|---|---|---|---|
| | | | |
