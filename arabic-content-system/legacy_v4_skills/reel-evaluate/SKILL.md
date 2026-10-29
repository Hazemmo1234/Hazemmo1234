---
name: reel-evaluate
description: Score reel scripts on the 100-point rubric (before vs after), run the lint and the regression suite, and write an honest comparison. Use after rewriting, when comparing versions, when changing the writing system, or for "قيّم السكريبت".
---

# Evaluate (stage 11 and system changes)

1. **Lint:** `python3 -I tools/lint_scripts.py <dir> --json evaluation/<name>_lint.json`
2. **Regression:** `python3 -I tests/run_regression.py <dir>`. It runs the permanent cases in
   `tests/regression/cases.json`.
3. **Rubric:** score with `system/RUBRIC.md`. Each dimension gets a score and a one-line
   justification quoting the line, marked "(judgement)" or "(fact)". Score the original and
   the revision with the same rubric, in the same sitting.
4. **Honesty rules:**
   - If a revision doesn't improve a dimension, say so, and revise again or document why.
   - Don't inflate. A revision that changed little scores close to the original.
   - Rubric scores and lint results are editorial checks. They never predict retention or reach.
     Only real analytics do that.
5. **Report:** original vs revised score, main improvements, remaining weaknesses,
   scientific corrections, word count and estimated duration (labelled as an estimate).
