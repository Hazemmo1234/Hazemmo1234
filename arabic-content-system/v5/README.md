# Round 1 v5: rewritten scripts + reusable content system

## What's here

| # | File | What |
|---|---|---|
| 1 | `original_scripts.md` | complete verbatim archive of the 12 scripts (+2 placeholders) with inventory |
| 2 | `rewritten_scripts.md` · **`rewritten_scripts.pdf`** | every script rewritten, in the original order, ready to record |
| 3 | `script_diagnostics.md` | per script: the exact weak passages, the new angle, the key decisions, a quality review |
| 4 | `before_after_evaluation.md` | 10×10 rubric scores for v3 / v4 / v5, measured text change, before/after passages |
| 5 | `content_system/` | Claude Code skills, guides, lint, tests |
| 6 | `afcon_storytelling_guide.md` | how to tell true football stories without AI-documentary narration |
| 7 | `egyptian_arabic_style_guide.md` | voice, rhythm, register, caps on tics |
| 8 | `quality_control_checklist.md` | acceptance criteria to apply to every final file |
| 9 | `regression_tests.md` | what the tests protect and how to run them |
| 10 | `README.md` | this file |

Also: `scripts/v5_draft1/` (first full draft, kept for the record), `scripts/v5_final/`,
`evaluation/` (score sources), `CLAUDE.md`. The source PDF is untouched in `../source/`.

## Use the system in Claude Code

```bash
cd arabic-content-system/v5
claude
```

`v5/.claude/skills` is a link to `content_system/skills/`, so the skills load when Claude Code
starts here. Check with `/skills`.

| Skill | Use it for |
|---|---|
| `reel-pipeline` | **start here**: routes story / educational / series and runs every stage |
| `reel-strategy` | viewer, reason to exist, angle |
| `reel-hooks` | opening candidates, scored |
| `story-structure` | beat list and progression |
| `afcon-storytelling` | true football/athlete stories |
| `fitness-rehab-scripts` | explainers and the «مالوش لازمة» series |
| `retention-edit` | the second pass: momentum, middle hooks, length |
| `egyptian-voice` | drafting and the read-aloud edit |
| `fact-check` | science and sports-history verification |
| `final-review` | checklist, scoring, regression, batch check |

### A new script
1. Copy `briefs/_TEMPLATE.md` to `briefs/<id>.md` and fill it in (topic, viewer, claims and sources, target seconds, lines you like).
2. `/reel-pipeline briefs/<id>.md`, or just «اكتبلي حكاية عن … 55 ثانية».
3. Output goes to `scripts/<round>_final/<id>.md`, with a worknote in `scripts/<round>_worknotes/`.
4. Check it: `python3 -I content_system/tools/lint_scripts.py scripts/<round>_final`.
5. Read it aloud 3× with a stopwatch.

### Rebuild these deliverables
```bash
python3 -I evaluation/scores_v5.py          # scores → JSON
python3 -I content_system/tools/build_v5.py # md deliverables + html
node content_system/tools/render_pdf.js     # PDF (pre-installed Playwright Chromium)
```

Requirements: Python 3 standard library, Node + Playwright for the PDF. No paid services.
The Noto Naskh Arabic font is bundled under the OFL licence (`../deliverables/assets/fonts/`).

## Earlier versions
`../` holds the v4 system and deliverables from the previous attempt (kept for comparison).
Its skills were moved to `../legacy_v4_skills/` so they can't conflict with these.
