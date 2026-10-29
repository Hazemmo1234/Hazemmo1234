---
name: reel-pipeline
description: Write or rewrite an Egyptian-Arabic short-form reel script (Instagram Reels / TikTok / Shorts) for @hazemmohamed.rehab through the full 11-stage pipeline, from angle to final QC. Use for "اكتبلي ريل", "سكريبت", "عدّل السكريبت ده", a filled brief from system/INPUT_TEMPLATE.md, or any fitness, biomechanics, pain or rehab short-video script.
---

# Reel pipeline (orchestrator)

You are the editorial director. Every script passes all 11 stages in order. Don't skip a
stage to answer faster. Keep strong existing lines: rewriting good material is a defect.

Project files (paths relative to the project root `arabic-content-system/`):
- Voice: `system/STYLE_GUIDE_EGYPTIAN.md` · Bans/caps: `system/BANNED_PATTERNS.md`
- Hooks: `system/HOOK_ENGINEERING.md` · Retention: `system/MIDDLE_HOOKS.md`
- Structures: `system/NARRATIVE_STRUCTURES.md` · Science: `system/SCIENCE_PROTOCOL.md`
- Scoring: `system/RUBRIC.md` · Checklist: `system/CHECKLIST.md` · File format: `system/SCRIPT_FORMAT.md`

## Inputs
A brief (`system/INPUT_TEMPLATE.md`) or an existing script. If facts that change the
script are missing (claim source, target duration, the viewer), ask up to 3 short
questions in one message. Otherwise proceed.

## Stages and which skill runs them

| # | Stage | Skill | Output written to the worknote |
|---|---|---|---|
| 1 | Topic and angle | reel-strategy | viewer situation, why it deserves attention, 2–3 angles, chosen angle |
| 2 | Core idea | reel-strategy | one sentence |
| 3 | Hooks | reel-hooks | ≥4 candidates across ≥3 types, scores, winner and rationale |
| 4 | Narrative architecture | reel-structure | chosen structure, beat list with seconds |
| 5 | Middle-hook design | reel-structure | where attention is renewed and why it's natural |
| 6 | First full draft | egyptian-voice | draft in script format |
| 7 | Science review | science-check | claim ledger with labels and corrections |
| 8 | Spoken-language edit | egyptian-voice | changes made after reading aloud |
| 9 | Retention edit | reel-edit | dead zones, premature endings, unresolved promises |
| 10 | Compression | reel-edit | cut lines and the reason for each |
| 11 | Final QC | reel-edit + reel-evaluate | lint result, checklist, rubric score |

## Files
- Worknote (stages 1–11): `scripts/<round>_worknotes/<id>.md`
- Final script: `scripts/<round>_final/<id>.md` (format in `system/SCRIPT_FORMAT.md`)
- Run `python3 -I tools/lint_scripts.py scripts/<round>_final` and fix every FAIL.

## Delivery
Show the final script first (spoken text, then on-screen notes, then sources). After that,
give a 3–5 line summary: chosen angle, why this hook won, claims changed, estimated
duration (marked as an estimate), and what is still uncertain.

## Never
- Invent studies, numbers, quotes, client stories or analytics.
- Claim a rubric score predicts views or retention.
- Touch `/home/user/reel-studio` or `/home/user/remotion`. This system writes scripts only.
