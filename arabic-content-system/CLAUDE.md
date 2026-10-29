> **Current system: `v5/` (start Claude Code in `arabic-content-system/v5`).** Everything below describes the v4 system, kept for comparison. Its skills moved to `legacy_v4_skills/`.

# Arabic short-form content system: project instructions

This folder is a self-contained writing system for @hazemmohamed.rehab reel scripts in
Egyptian Arabic. It writes **scripts only**.

## Rules
- For any reel or script request, use the `reel-pipeline` skill (11 stages). Don't skip stages.
- Read `system/STYLE_GUIDE_EGYPTIAN.md` and `system/BANNED_PATTERNS.md` before writing any Arabic.
- Never invent studies, numbers, quotes, client stories, audience data or analytics. Verify
  claims with PubMed (see `system/SCIENCE_PROTOCOL.md`).
- Protect lines Hazem already likes (style guide → voice fingerprint; brief → «سطور عاجباك»).
- Before saying a script is done: `python3 -I tools/lint_scripts.py <dir>` (0 FAIL),
  `python3 -I tests/run_regression.py scripts/v4_final` (if you changed the system), and a
  rubric score (`system/RUBRIC.md`). Never present rubric scores as retention predictions.
- Don't modify `/home/user/reel-studio`, `/home/user/remotion`, or global Claude Code
  settings. Video editing is a different workflow.
- `source/Reel_Scripts_Round1_v3_original.pdf` and `scripts/v3_original/` are the archive.
  Never edit them, except to correct a verified transcription error (and log it).

## Layout
- `.claude/skills/`: reel-pipeline, reel-strategy, reel-hooks, reel-structure, egyptian-voice, science-check, reel-edit, reel-evaluate
- `system/`: style guide, banned patterns, hooks, middle hooks, structures, science protocol, rubric, checklist, input template, file format
- `scripts/<round>_{original,pass1,final,worknotes}/`: one file per script
- `tools/`: lint, calibration, build, PDF render, integrity check · `tests/`: regression suite
- `deliverables/`: rewritten collection (md/pdf) and before/after report
