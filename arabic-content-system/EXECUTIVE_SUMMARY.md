# Executive summary

## Bottom line

All 12 scripts in Round 1 v3 have been rewritten, scored against the same rubric before and
after, run through a mandatory second pass, and checked by an automated lint and regression
suite. The average editorial score went from **68.9 to 80.3 / 100**. **8 of 12** meet the
quality bar (≥80, accuracy ≥8, no Low band). The other 4 sit at 78–79, and each one needs a
decision from you rather than more polishing. **Three claims were corrected** because they were
stronger than their sources, and **two of my own transcription errors** were caught by an automated
cross-check and fixed. The reusable system (8 Claude Code skills plus guides, lint and tests)
is in this folder.

These scores are my editorial judgement, written down so you can disagree line by line. They
don't predict views or retention. Only your analytics can test that (testing plan below).

## What was built

| Deliverable | Where |
|---|---|
| A. Research audit (5 repos + 1 added) | `research/RESEARCH_AUDIT.md` |
| B. Content system: 8 skills + guides | `.claude/skills/`, `system/` |
| C. Original script archive (verbatim, with inventory) | `source/ORIGINAL_SCRIPTS.md`, `source/*.pdf`, `scripts/v3_original/` |
| D. Rewritten collection, original order | `deliverables/REWRITTEN_SCRIPTS.pdf` / `.md` |
| E. Before/after report | `deliverables/BEFORE_AFTER_REPORT.md` |
| F. Checklist | `system/CHECKLIST.md` |
| G. Input template | `system/INPUT_TEMPLATE.md` (copy in `briefs/`) |
| H. Regression suite | `tests/` |
| I. Usage guide | `README.md` |
| J. This summary | `EXECUTIVE_SUMMARY.md` |

## What the diagnosis found in v3

1. **9 reflexive «مش X… Y» contrast reveals** (A1 alone had 3). They make the voice predictable and generated-sounding.
2. **7 spoken disclaimers** mid-flow («الرسم ده للتوضيح، مش أرقام»، «مجرد ملاحظة»). Honest, but they kill momentum. Moved on screen.
3. **4 of 5 approved reels ended on "go see a professional"**. Repetitive, no takeaway, and it positions you as a referrer.
4. **Both injury stories ran over their own 45–55 s target** (EP01 est. 57–69 s).
5. **Three overstatements:** EP5 said cardio is useless for muscle (the meta-analysis and your own note say *smaller* gains); EP3 dismissed stretching for injuries (the review actually recommends it *inside* a dynamic warm-up for muscle injuries); GEDO credited CAF with the «Super Sub» nickname (the source doesn't say that).
6. **What was already strong and was kept:** your «مؤكد / ممنوع يتقال» discipline, the on-screen sample sizes, and lines such as «العضمة مالهاش دعوة الماتش قد إيه مهم», «التمرين اللي مابيتقلش ومابيتقاسش…», «هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش», and B3's wall hook.

## What changed (highlights)

- **Hooks:** different hook types across the batch (moment, recognition, number, comparison, demonstration, story cold-open), so the batch doesn't sound templated. For A1, the v3 hook is kept as an `[ALT]` for a real A/B test.
- **Middle hooks** come out of the content: A1's «بحوالي 40%» (verified: 1.4× max isometric), B2's «والاتنين اتحسنوا قد بعض», B3's «ممكن يختلف لحد 2 سنتي لو عدته».
- **Payoffs you can act on:** B2's next-morning pain rule, B3's measure → train → re-test, A2's «ماتسألش «لسه بيوجع؟». اسأل «بيسندني؟»».
- **The «مالوش لازمة» series** keeps your format and refrain, but every condition is now concrete, unique across episodes, and true at the strength it's stated. All 4 stay ≤25 s (estimated).
- **Pass 2 caught pass 1's mistakes.** Pass 1 made 5 scripts too long, replaced B3's strong hook, and opened 4 of 5 approved reels with a question. All fixed, and the regression suite now guards against all three.

| Automated check | v3 | v4 final |
|---|---|---|
| lint FAIL / WARN | 2 / 8 | 0 / 0 |
| contrast reveals · spoken disclaimers · referral endings | 9 · 7 · 4 | 0 · 0 · 0 |
| regression suite | 2/13 | 13/13 |
| integrity check (IDs, verbatim lines, Arabic codepoints, transcription vs PDF text layer) | n/a | PASS |

## What's still uncertain, and your decisions

1. **B1 (79):** practical value is capped because no numeric benchmark is given. Do you want to state one, e.g. "≥90% of the healthy side", which comes from ACL return-to-sport research (Grindem 2016)? It's a principled generalisation, but not a universal rule.
2. **«مالوش لازمة» format (EP1 at 79):** the identical refrain hook caps hook and narrative scores. Keep it as your series signature (my recommendation: yes, test it first), or allow episode-specific hooks?
3. **EP02 (79) and GEDO (78):** more viewer value means cutting story detail. That's your editorial call.
4. **A1 hook:** test H2 (new) against the v3 hook (ALT) with real views instead of deciding by opinion.
5. **EP4 and A3** have no text in the PDF and weren't drafted. EP4 still needs the adherence/dose source you planned.
6. **Voice calibration:** there are no recordings of you. Paste 2–3 transcripts of you talking unscripted into a brief (`عينات صوت`) and the style guide's "voice fingerprint" can be updated.
7. **Facts not re-verified:** the news sources behind the two stories (carried from your v3 research with their «ممنوع يتقال» lists); I independently confirmed the tournament facts only. Also not re-checked: Bishop 2003, Ekstrand & van Dijk 2013, Soligard 2008.

## Testing plan (how to find out whether this actually works)

1. Film from `REWRITTEN_SCRIPTS.pdf`. Read each script 3× with a stopwatch first; if one runs long, cut it with `/reel-edit`.
2. Where you have two hooks (A1 now; any script later), post the same body with the two hooks: a/b on different days, or with Instagram's trial-reels option if your account has it.
3. Log every reel in `evaluation/PERFORMANCE_LOG.md`: 3-second hold, average watch time, % watched, saves, shares.
4. After 10–15 reels, compare: do the rubric dimensions (hook, narrative) line up with hold and watch time? If they don't, change the rubric, not the data.

## How to use it next time

`cd arabic-content-system && claude`, then `/reel-pipeline briefs/<your brief>.md`. Details in `README.md`.
