# v6: complete content rebuild (Part A + injury series + system)

## Deliverables

| File | Contents |
|---|---|
| `original_scripts.md` | unchanged archive of all 12 scripts (+2 placeholders) from the PDF, with inventory |
| `rewritten_scripts.md` | **Part A**: every original script, rewritten, in the original order (topic · core idea · final script · improvements · sources) |
| `afcon_injury_series.md` | **Part B**: 7 episodes, 7 players, 7 different injuries. Each has its facts, narration, mechanism, lesson, payoff, duration, sources and limitations |
| `research_and_sources.md` | why these cases, how they were verified, every scientific source with DOI, what's unresolved |
| `editorial_review.md` | **Part D**: v3 → v5 → v6 scores, measured text change, the learning check per episode, the checks run, the failures fixed |
| `content_system/` | **Part C**: 10 Claude Code skills, guides, lint, tests, checklist |
| `egyptian_arabic_style_guide.md` | voice and language standards, including how to explain science in Egyptian |
| **`final_scripts.pdf`** | all scripts, ready to record (series first, then Part A), Arabic RTL, Noto Naskh |

Script source files: `scripts/partA_final/`, `scripts/series_final/` (and `series_draft1/` for the record).

## Use it in Claude Code

```bash
cd arabic-content-system/v6
claude
```

`v6/.claude/skills` links to `content_system/skills/`.

| Skill | When |
|---|---|
| `reel-pipeline` | start here. It routes: injury story → `sports-injury-storytelling`; explainer/series → `fitness-rehab-scripts` |
| `sports-injury-storytelling` | a player + a documented injury: story + `[SCI]` science + lesson, all three required |
| `fact-check` | separates player-specific facts (club/federation/press) from general science (PubMed) |
| `reel-strategy` · `reel-hooks` · `story-structure` · `retention-edit` · `egyptian-voice` · `final-review` | the stages |

**A new injury episode:** «اعمل حلقة عن إصابة [لاعب] في [بطولة]، 70 ثانية». The pipeline builds a case sheet, verifies the facts, drafts with `[SCI]` lines in the first half, compresses to 60–80 s, and runs:

```bash
python3 -I content_system/tools/lint_scripts.py scripts/<dir>
python3 -I content_system/tests/run_regression.py scripts/series_final content_system/tests/cases_series.json
```

**Rebuild the deliverables:** `python3 -I content_system/tools/build_v6.py && node content_system/tools/render_pdf.js`

## Lengths (estimates, ≈1.95 words/s)
Series 60–80 s, because each episode carries a story *and* a lesson; that's longer than a typical reel, on purpose. Fitness explainers 40–55 s. «مالوش لازمة» ≤25 s (your rule). Read each script aloud 3× and use the median.

Previous versions (`../v5`, `../deliverables` = v4) are kept for comparison. Their skills are not loaded from here.
