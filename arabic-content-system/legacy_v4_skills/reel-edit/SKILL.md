---
name: reel-edit
description: Retention edit, compression and final quality control for a drafted reel script. Finds dead zones, premature endings, unresolved promises and removable lines, then checks duration and the full checklist. Use for stages 9–11, or for "اختصره", "طويل", "ممل في النص", "راجعه قبل التصوير".
---

# Retention edit, compression and QC (stages 9–11)

## Stage 9: retention edit
Use the checks in `system/MIDDLE_HOOKS.md`: where the hook is answered, dead zones over ~8 s,
disclaimer interruptions, premature endings, unresolved promises, repetition.

## Stage 10: compression
Go line by line and ask: if I delete this, does the viewer lose understanding, proof or
momentum? If not, delete it. Log each cut with a reason. Don't cut the one qualifier that
keeps a claim honest.

## Stage 11: final QC
1. `python3 -I tools/lint_scripts.py <dir>`: fix all FAILs, and justify or fix each WARN.
2. Walk through `system/CHECKLIST.md`.
3. Check that the hook is fulfilled, the ending is earned and the duration is inside the
   target (estimate). Recommend 3 timed read-alouds and taking the median.
4. Hand off to reel-evaluate for scoring.
