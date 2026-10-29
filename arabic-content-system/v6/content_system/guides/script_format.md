# Script file format

Every script (original, draft, final) is one Markdown file. The same format is read by
`tools/lint_scripts.py`, `tests/run_regression.py`, and `tools/build_collection.py`, so the
originals and the rewrites are measured the same way.

```markdown
---
id: A1                 # stable ID, never reused
order: 1               # position in the collection
series: approved       # approved | story | maloosh | <new series slug>
title: لما الهامسترينج بيشيل أعلى حمل
title_en: When the hamstring is under the most load
format: تصوير + جرافيكس
target: 35-45          # intended spoken seconds (range). Stories: 50-60. Series: 18-25
version: v4-final
---
## SPOKEN
[HOOK] first 1–3 seconds. Only what is said out loud.
[LINE] a spoken line
[SCI] a spoken line that explains anatomy/physiology/evidence (required ≥2 in injury episodes, first one in the first half)
[MID] a middle hook: the line that renews attention
[LINE] ...
[END] the payoff / closing idea
[CTA] optional call to action (spoken)
[ALT] optional alternative line (not spoken, ignored by duration count)
## PRODUCTION
- على الشاشة: on-screen text, cards, overlays
- تصوير: shot notes
## NOTES
- editorial notes, "مش بنقول" (what we deliberately don't claim), confirmed facts
## SOURCES
- Author Year — Journal (DOI if known)
```

Rules
- Only `[HOOK] [LINE] [SCI] [MID] [END] [CTA]` count as spoken and as duration.
- Disclaimers, sample sizes and caveats belong in `PRODUCTION`/`NOTES` unless the viewer
  must hear them to avoid being misled. Then use one short spoken clause.
- Any number spoken aloud needs at least one entry under `SOURCES`.
