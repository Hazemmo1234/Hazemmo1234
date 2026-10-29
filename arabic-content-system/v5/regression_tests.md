# Regression tests

Run from `v5/`:

```bash
python3 -I content_system/tools/lint_scripts.py scripts/v5_final        # 0 FAIL required
python3 -I content_system/tests/run_regression.py scripts/v5_final      # 13/13 required
python3 -I content_system/tests/run_regression.py ../scripts/v3_original # baseline: 1/13 (shows what the suite catches)
python3 -I content_system/tests/run_regression.py ../scripts/v4_final    # previous attempt: 8/13
```

Re-run them after changing any skill, guide or `content_system/lint_patterns.json`, and after
rewriting a script. The cases live in `content_system/tests/cases.json`.

## What each case protects

| Case | Type | Main assertions | Catches |
|---|---|---|---|
| A1 | educational, mechanism + numbers | ≤1 contrast; v3 contrast lines gone; payoff mentions «بتتمط»; van Dyk + Sun cited; no "Nordic alone halves injuries"; «أول سؤال» qualifier + on-screen multifactor note | the contrast tic, overclaiming |
| B1 | educational, model | 0 spoken disclaimers; no «فإن»; payoff contains «قارن»; on-screen «رسم توضيحي» | disclaimers, MSA, abstract payoff |
| A2 | educational, number + demo | 22/33/522 present; no relative 35%; no referral; «بيسندني» | relative-number spin, a default referral |
| B2 | educational, comparison | «ماتوقفش»; both trials cited; no "injection is harmful"; no 5/10 | conflated trials, unsupported thresholds |
| B3 | educational, demo | hook keeps «اقف قدام حيطة… بيتني»; 2 cm present; no normal values; re-test payoff | rewriting a strong hook, invented norms |
| EP01 | story, delayed reveal | the hook mustn't reveal «طلب»; the turn sits in [MID]; Omdurman stakes present; no «انتقام», no invented feelings, no cause claims; ≤66 s upper | giving away the reveal, missing stakes, fabricated drama |
| EP02 | story, bookend | the hook mustn't contain the duel, Song or Aboutrika; «الكاميرون تاني», «جاب جولين», «مفيش واحدة مؤكدة»; no exact minute 76/77; no injury account as fact | front-loaded payoff, a lost bookend, false precision |
| GEDO | story, paradox | hook verbatim; no «والكاف»; «الأرقام دي عامة»; «قبل البطولة بأسبوعين»; no "replaced Aboutrika"; no exact minutes | unsupported attribution, false links |
| EP1–EP5 | series ≤25 s | upper estimate ≤25 s; refrain ≥2 where required; corrected claims stay corrected; EP2 brand line verbatim | length creep, science regressions |
| SET | the batch | referral ≤1; no repeated hook openers; ≤2 question hooks in approved reels; unique series conditions; unique story structures; no sports clichés | template sameness |

## What the tests can't judge

Whether a story is *gripping*, a line *sounds like Hazem*, or a hook *stops the scroll*. That
takes `content_system/guides/rubric.md`, a read-aloud, and real analytics (3-second hold,
average watch time, saves, shares). Some assertions encode Round 1 decisions; they protect
those decisions, not the quality of new scripts.

## Adding a case
Add an object to `cases.json` with the script `id`. Available keys: `must_contain`,
`must_not_contain`, `hook_must_contain`, `hook_must_not_contain`, `mid_must_contain`,
`payoff_keywords`, `forbidden_regex`, `required_sources`, `required_numbers_anywhere`,
`production_must_contain`, `keeps_qualifier`, `max_contrast`, `max_disclaimers`,
`max_referral`, `max_est_seconds_hi`, `min_refrain`, `must_contain_any`.
