> **Latest: Round 1 v5 is in [`v5/`](v5/README.md)**: full rewrite (AFCON stories rebuilt), a 10-skill system, and `v5/rewritten_scripts.pdf`. This page documents v4.

# Arabic short-form content system: usage guide

A reusable Claude Code system for writing, checking and improving Egyptian-Arabic reel
scripts for @hazemmohamed.rehab. Built and tested on Round 1 v3 (12 scripts).

Start here: **`EXECUTIVE_SUMMARY.md`** (what was built and what changed) →
**`deliverables/REWRITTEN_SCRIPTS.pdf`** (scripts to film) →
**`deliverables/BEFORE_AFTER_REPORT.md`** (scores and reasons).

## 1. Open the project in Claude Code

```bash
cd arabic-content-system
claude
```

Start Claude Code **inside this folder**. The skills live in `arabic-content-system/.claude/skills/`
and `CLAUDE.md` is read from here. Check that the skills loaded with `/skills`. You should see
`reel-pipeline`, `reel-strategy`, `reel-hooks`, `reel-structure`, `egyptian-voice`,
`science-check`, `reel-edit` and `reel-evaluate`.

## 2. Write a new script

1. Copy the brief template: `cp system/INPUT_TEMPLATE.md briefs/A4.md` and fill in what you know
   (topic, viewer situation, claims and sources, target seconds, lines you want kept).
2. In Claude Code:
   ```
   /reel-pipeline briefs/A4.md
   ```
   or just: «اكتبلي ريل عن ألم الركبة وانت بتطلع السلم، 40 ثانية، البريف في briefs/A4.md»
3. The pipeline writes:
   - `scripts/round2_worknotes/A4.md`: angle, hook candidates and scores, beats, claims ledger
   - `scripts/round2_final/A4.md`: the script (format: `system/SCRIPT_FORMAT.md`)
4. Check it:
   ```bash
   python3 -I tools/lint_scripts.py scripts/round2_final
   ```
   Fix every FAIL. Each WARN gets fixed or justified.
5. Read it aloud 3 times with a stopwatch and use the median (the duration in the lint is an estimate).

## 3. Rewrite or improve an existing script

```
/reel-pipeline عدّل السكريبت ده: <paste>   (أو مسار الملف)
```
The pipeline keeps lines that already work. Add «سطور عاجباك» in the brief to protect specific lines.

Single stages, when you only need one thing:

| Need | Command |
|---|---|
| Hook options for a topic | `/reel-hooks <topic or script>` |
| "The middle is boring" | `/reel-structure <script>` |
| Make it sound natural | `/egyptian-voice <script>` |
| Is this accurate? | `/science-check <script>` |
| Too long / final check before filming | `/reel-edit <script>` |
| Score v1 vs v2 | `/reel-evaluate <dir or files>` |

## 4. When you change the system itself

If you edit a skill, `system/*.md` or `system/lint_patterns.json`:

```bash
python3 -I tests/run_regression.py scripts/v4_final     # must stay 13/13
python3 -I tests/run_regression.py scripts/v3_original  # baseline; should keep catching v3's issues
```

Then re-run the pipeline on 2–3 representative briefs and compare rubric scores. See
`tests/EXPECTED_QUALITIES.md`.

## 5. Rebuild the Round 1 deliverables

```bash
python3 -I tools/build_collection.py   # archive, collection, report, HTML
node tools/render_pdf.js               # PDF (uses the pre-installed Playwright Chromium)
python3 -I tools/verify_integrity.py   # completeness + Arabic integrity
```

`tools/build_collection.py` is wired to Round 1's folders (`scripts/v3_original`,
`scripts/v4_pass1`, `scripts/v4_final`). For a new round, copy it and change the three paths.

## 6. Folder map

| Path | What |
|---|---|
| `.claude/skills/` | 8 skills (pipeline + stages) |
| `system/` | style guide, banned patterns, hook and middle-hook guides, structures, science protocol, rubric, **checklist** (F), **input template** (G), script format, lint patterns |
| `source/` | original PDF (unchanged copy) and **ORIGINAL_SCRIPTS.md** (C) |
| `scripts/v3_original` · `v4_pass1` · `v4_final` · `v4_worknotes` | every version of every script, plus pipeline notes |
| `deliverables/` | **REWRITTEN_SCRIPTS.md/.pdf** (D), **BEFORE_AFTER_REPORT.md** (E) |
| `evaluation/` | rubric scores (`scores_source.py` → `scores.json`), diagnosis, lint and regression outputs |
| `tests/` | **regression suite** (H): `regression/cases.json`, `run_regression.py`, `EXPECTED_QUALITIES.md` |
| `research/RESEARCH_AUDIT.md` | **research audit** (A) |
| `tools/` | parser, lint, calibration, build, PDF render, integrity check |

Requirements: Python 3 (standard library only), `pdftotext` (poppler) for the integrity check,
and Node + Playwright for the PDF. No paid tools or APIs. The Noto Naskh Arabic font is
bundled under the OFL licence (`deliverables/assets/fonts/`).

## 7. Feed results back

After posting, log the numbers in `evaluation/PERFORMANCE_LOG.md`: 3-second hold, average
watch time, saves, shares and comments, next to the script ID and hook variant. That log is
the only thing that can confirm or overturn the rubric.
