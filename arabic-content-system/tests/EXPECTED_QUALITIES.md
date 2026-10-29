# Regression suite: expected qualities

## What runs automatically

```bash
python3 -I tools/lint_scripts.py scripts/v4_final      # per-script and set-level lint
python3 -I tests/run_regression.py scripts/v4_final    # permanent cases from Round 1
python3 -I tools/verify_integrity.py                   # deliverables complete, Arabic intact
```

Run the regression suite on `scripts/v3_original` to see what it catches: it passes 2 of 13 there.
When you change the writing system (a skill, the style guide, the patterns), re-run the
pipeline on the representative cases and check that they still pass **and** that the rubric
scores don't drop.

| Detects | How |
|---|---|
| Generic hooks | lint: first-sentence length; set check: repeated hook openers; cases: `hook_must_contain` for hooks that must survive |
| Repeated hook patterns | set check: at most 2 approved reels may open with a question; no shared 2-word openers |
| Missing or artificial middle hooks | lint: `[MID]` required. Whether it's *natural* is human-judged (below) |
| Unnatural Egyptian Arabic | lint: MSA markers, stock phrases, em dash, contrast-reveal cap, spoken disclaimers |
| Excessive length | lint: estimated duration vs `target`; cases: `max_est_seconds_hi` (series ≤25 s) |
| Unsupported scientific claims | cases: `forbidden_regex` for known overstatements; `required_sources`; lint: numbers without sources |
| Unresolved curiosity gaps / hook–payoff mismatch | cases: `payoff_keywords` that must appear in `[END]`/`[CTA]` |
| Repetitive conclusions | set check: generic referral endings ≤1; ending similarity within a series |
| Excessive rewriting of good lines | cases: `must_contain` protected lines (EP01, EP02, B1, EP2 brand line, B3 and GEDO hooks) |
| Duplicated series conditions | set check: «مالوش لازمة لو …» conditions unique across episodes |

## Representative cases

`A1` (mechanism + numbers), `B1` (model, no data), `B3` (demonstration), `EP01` (story with
protected lines and forbidden facts), `GEDO` (paradox story plus an attribution correction),
`EP3` and `EP5` (≤25 s series with science corrections). The other five are also checked.

## What a successful output looks like (human-judged; score with `system/RUBRIC.md`)

1. Within 2 seconds, the target viewer knows this is about them.
2. The hook couldn't open a video on a different topic.
3. Something new arrives about every 5–8 s; the middle hook comes out of the content.
4. Read aloud by Hazem, no line sounds read; no sentence needs a second breath.
5. Every claim matches its source at the strength it's stated; caveats are on screen.
6. The ending delivers what the hook implied, or gives one action for today.
7. Lines Hazem already liked are still there unless they were inaccurate.

## Honest limits

- `payoff_keywords`, `must_contain` and `forbidden_regex` encode decisions made in Round 1.
  They protect those decisions; they don't prove a new script is good.
- Word-count duration is an estimate (±10%). Real timing needs 3 read-alouds.
- No automated check predicts attention. Use real analytics (3-second hold, average watch
  time, saves, shares) to judge the system, and add a case whenever a published reel teaches
  you something.

## Adding a case

Add an object to `tests/regression/cases.json` with the script `id` and the assertions you
need (see the keys used above). Keep the `detects` list honest: name the failure the case
exists to catch.
