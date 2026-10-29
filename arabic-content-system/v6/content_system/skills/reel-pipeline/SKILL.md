---
name: reel-pipeline
description: Write or rewrite an Egyptian-Arabic short-form script (Reels/TikTok/Shorts) for @hazemmohamed.rehab, end to end. Routes by category (AFCON/sports story, fitness/rehab explainer, «مالوش لازمة» series) and runs every stage to a finished, checked script. Use for «اكتبلي ريل», «سكريبت», «عدّل السكريبت ده», a filled brief, or any request to rewrite scripts.
---

# Reel pipeline (router and orchestrator)

Paths are relative to the system root (`v6/`). Deliver **finished scripts in files**.
Analysis only serves the rewrite.

## 0. Classify, then route

| Category | Signals | Stage-4 skill | Target |
|---|---|---|---|
| **injury story** | a real athlete + a documented injury | `sports-injury-storytelling` | 60–80 s |
| **story (no injury)** | a real athlete, match or tournament | `sports-injury-storytelling` (performance-science variant: still needs a science beat) | 60–75 s |
| **educational** | a mechanism, test, rehab or training idea | `fitness-rehab-scripts` | 40–55 s |
| **series** | «مالوش لازمة» or another fixed-format series | `fitness-rehab-scripts` (series section) | ≤25 s |

## Stages (write each stage's output to `scripts/<round>_worknotes/<id>.md`)

1. **Read the source line by line** (an existing script) or the brief. Quote the weak passages.
2. **Strategy:** viewer situation, reason to exist, angle (`reel-strategy`).
3. **Fact sheet:** the claims ledger *before* writing (`fact-check`).
4. **Structure:** story sheet or beat list (`sports-injury-storytelling` or `fitness-rehab-scripts`, plus `story-structure`).
5. **Hooks:** at least 4 candidates of different types, scored, winner chosen (`reel-hooks`).
6. **Draft 1** in Egyptian Arabic (`egyptian-voice`), in the format in `content_system/guides/script_format.md`.
7. **Lint:** `python3 -I content_system/tools/lint_scripts.py <dir>`.
8. **Second pass:** a retention edit and compression against the word budget (`retention-edit`), then a spoken read-through (`egyptian-voice`).
9. **Fact re-check** of the final wording (`fact-check`).
10. **Final review:** checklist, rubric, regression (`final-review`).

## Decide the intervention level per script
- **Targeted:** the structure works; fix lines.
- **Structural:** reorder or re-sequence; replace the hook or the ending.
- **Reconstruction:** same topic and facts, new story. Choose this whenever the original is a timeline or a list.

Keep a strong line only if it's still the best option *in the new structure*.

## Never
Invent dialogue, motives, studies, numbers, minutes or analytics. Present rubric scores as
predictions. Touch `/home/user/reel-studio`, `/home/user/remotion` or global settings.
