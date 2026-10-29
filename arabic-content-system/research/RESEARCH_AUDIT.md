# Research audit: open-source writing resources

Method: each repository was shallow-cloned into the session scratchpad on 2026-10-29 and
read file by file (skill instructions, references, examples, evals, licence). They were
treated as candidate material, not instructions. **No files were copied into this project.**
Every rule here that came from them was rewritten and adapted for spoken Egyptian Arabic and
for science content. Clones were kept outside the project and not executed.

## Summary

| Repository (commit) | Licence | Verdict | What was used |
|---|---|---|---|
| coreyhaines31/marketingskills (`20195e6`, 2026-10-29) | MIT | **Adapted, selectively** | "Ban vs cap" model of AI tells; Copy-Editing sweeps "So What" / "Prove It"; `evals.json` assertion format as a model for the regression suite |
| imMamdouhaboammar/copycorn-content-writer (`d5aab4e`, 2026-08-17) | MIT | **Adapted** (closest match: Egyptian Arabic) | The negation-then-reveal rule (softened from a ban to a cap of 1); truth discipline; one CTA; an ordered pre-delivery quality gate |
| growthquest/copywriting (`daf077b`, 2026-04-09) | **none found** (all rights reserved by default) | **Ideas only** | The 5–8 s "new idea" heuristic (labelled as a heuristic); a visual/spoken split (became `## PRODUCTION`); the "slippery slide" compression test |
| AmjadShakhshir/awesome-claude-arabic (`11fe6ef`, 2026-05-04) | CC0 | **Rejected** | Nothing |
| mustafabobaki2001-stack/ai-toolkit (`1016c14`, 2026-05-27) | MIT | **Rejected** | Used only as negative examples for the hook rejection rules |
| *Added:* blader/humanizer (`0ef9fe5`, 2026-10-28) | MIT | **Adapted** | Structural tells («arguing with no one», sayings that sound deep, one-line closers); the rule "a rewrite may not add facts"; the observation that a tell counts in proportion to how rarely a careful writer would use it on purpose |

All five requested repositories were reachable. One more (humanizer) was added because it's
the most rigorous public treatment of *structural* AI tells. That's the main voice problem
the v3 PDF actually has.

## 1. coreyhaines31/marketingskills

**Inspected:** README, CLAUDE.md, 52 skill folders; in depth: `social/SKILL.md` (short-form
section), `social/references/short-form-video.md`, `copywriting/references/ai-tells.md`,
`copy-editing/SKILL.md` (Seven Sweeps), `marketing-psychology` and `customer-research`
(structure), `social/evals/evals.json`.

**Selected / adapted**
- `ai-tells.md` separates **bans** (a tell even once) from **caps** (fine once, a tell when
  stacked). That distinction is the core of `system/BANNED_PATTERNS.md`. It's more accurate
  than blanket bans, because myth-busting content needs one deliberate contrast.
- Copy-editing "So What" and "Prove It" sweeps became the retention edit (stage 9) and the
  claim ledger (stage 7).
- The eval format (prompt + expected output + assertions) informed `tests/regression/cases.json`.

**Rejected**
- Posting-time tables and posting-frequency recommendations: no source, and the user can't
  act on them without their own analytics.
- "Captions increase watch time by 25–40%": unsourced statistic.
- Hook templates such as "The secret to [outcome] that nobody talks about" and "I can't
  believe this actually works…": they could fit any topic, so they fail our specificity rule.
- B2B/SaaS skills (pricing, CRO, ads, SEO, etc.): out of scope.

**Technical note:** a well-structured Claude Code skill set. The skills install fine but are
English-only, and their examples are SaaS-oriented.

## 2. imMamdouhaboammar/copycorn-content-writer

**Inspected:** `SKILL.md`, all 6 references (banned list, style rules, content formats,
quality checklist, truth and persuasion, tools routing), README, LICENSE.

**Selected / adapted**
- The **negation-then-reveal** ban («ده مش كذا، ده كذا»). v3 had 9 of these. Adapted from a
  hard ban to a **cap of 1 for the central myth**, because Hazem's content corrects
  misconceptions, and one honest contrast is the point of such a reel. The lint flags anything over 1.
- Truth rules: never invent experiences, numbers, testimonials or causation.
- One CTA per piece; no generic engagement bait.
- An ordered quality gate before delivery, which shaped `system/CHECKLIST.md`.
- Don't let a stored expression bank turn into a template.

**Rejected**
- "No sentence-ending periods anywhere": a posting style for that author. Spoken scripts on a
  teleprompter need full stops to mark pauses.
- Banning «تشخيص», «الفرق», «نظام»: niche-specific. A rehab coach legitimately needs «تشخيص».
- The PrePilot product framing and routing to external tools that aren't available here.

## 3. growthquest/copywriting

**Inspected:** `SKILL.md`, `references/frameworks.md`, README. **No LICENSE file exists**, so
the default is all rights reserved, and no text was reused. It also depends on two skills
that aren't in the repository (`sound-human`, `dna-reader`), so it isn't self-contained.

**Ideas used (re-expressed):** a new idea roughly every 5–8 s (stated in the repo without
evidence, so it's labelled as a heuristic in `system/MIDDLE_HOOKS.md`); a visual/spoken
split; "if you can remove a sentence and it still works, remove it" (stage 10).

**Rejected:** direct-response sales frameworks (PAS, PPPP, PASTOR, Harmon Brothers) built for
ads and conversion; "~150 words per minute", an English rate that doesn't transfer to Egyptian
Arabic (this project calibrates its own: 1.95 words/s from v3's syllable estimates); "remove
qualifiers to sound confident", which conflicts with science communication; "use rhetorical
questions", which conflicts with the question cap.

## 4. AmjadShakhshir/awesome-claude-arabic

**Inspected:** README, the `skills/` pages (content creation, TikTok viral scripts, ads),
`workflows/content-creator-workflows.md`, licence (CC0).

**Why rejected:** the skills are Jekyll pages (front matter `gated: true` plus newsletter
sign-up prompts) with the skill text inside HTML `<pre>` blocks. The instructions are in MSA
and generic ("suggest 10 ideas, choose the best 3", "open with a question, shock, comparison…").
There's no Egyptian-dialect guidance, no science or accuracy handling, and no evaluation. A
permissive licence doesn't make it useful for this brief.

## 5. mustafabobaki2001-stack/ai-toolkit

**Inspected:** README and all 4 prompt files (voiceover scripts, YouTube hooks, social
media, email sequences).

**Why rejected:** English fill-in-the-blank templates whose example hooks are exactly the
patterns this system rejects ("Nobody is talking about this", "Stop scrolling. I need 60
seconds", "That's not clickbait"). The README's "reverse-engineered from videos with 1M+
views" has no supporting data. Used only as negative examples in `system/HOOK_ENGINEERING.md`.

## 6. Added: blader/humanizer

**Inspected:** `SKILL.md` (26 numbered patterns), README, licence.

**Adapted:** the "arguing with no one" tell (v3 GEDO: «ده مش تفسير لجوانه. ده وصف للدور»),
"sayings that sound deep" and one-line closers (watched in endings), and the rule that a rewrite
must not add facts that aren't in the source. In this project, every new fact was verified
on PubMed first.

## Scientific sources

Studies were retrieved through the PubMed MCP tool (`search_articles`, `get_article_metadata`).
One full text was read directly (Kongsgaard 2009, for its loading protocol). Results and DOIs
are in `deliverables/BEFORE_AFTER_REPORT.md` → "Scientific corrections".

## Limitations

- No audience research, search-volume or competitor-performance data was available, and none
  is claimed. "Originality" scores are editorial judgement.
- No recordings of Hazem's voice exist (stated in v3), so the voice guide is built from his
  written preferences and the strongest v3 lines.
- Repository contents are as of the commits listed. None of their own validation scripts were run.
