---
name: final-review
description: Final quality control and scoring. Applies the checklist to the actual final files, scores original vs rewrite on the 10×10 rubric, runs lint and regression, and checks the whole batch for repeated openings, structures and endings. Use before delivering, when comparing versions, or after changing the system.
---

# Final review

1. `python3 -I content_system/tools/lint_scripts.py <final_dir>`: 0 FAIL; each WARN fixed or justified.
2. `python3 -I content_system/tests/run_regression.py <final_dir> [cases.json | cases_series.json]`: all cases pass (see `content_system/regression_tests.md`).
3. Walk through `content_system/quality_control_checklist.md` **per script, on the file**, not from memory.
4. Score with `content_system/guides/rubric.md`: the original and the rewrite in the same sitting, one justification each. Don't inflate. If a rewrite isn't meaningfully better, rewrite it again.
5. **Batch check:** openings, story shapes, transitions and endings must not repeat.
6. Measure the change from the original (word-level similarity). Report it, so "nothing changed" can't happen silently.
7. Rubric scores are diagnostics, never predictions of reach or retention.
