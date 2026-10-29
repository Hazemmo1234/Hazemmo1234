# Regression tests (v6)

Run from `v6/`:

```bash
python3 -I content_system/tools/lint_scripts.py scripts/partA_final
python3 -I content_system/tools/lint_scripts.py scripts/series_final
python3 -I content_system/tests/run_regression.py scripts/partA_final                                     # Part A: 13/13
python3 -I content_system/tests/run_regression.py scripts/series_final content_system/tests/cases_series.json  # series: 8/8
python3 -I content_system/tests/run_regression.py ../scripts/v3_original                                  # baseline: the original PDF
```

## What the series cases protect (`tests/cases_series.json`)

| Case | Key assertions |
|---|---|
| all episodes | `min_sci` ≥2 (S7: 1), `sci_integrated` (first [SCI] in the first half), ≤88 s upper estimate, required scientific and news sources |
| S1 Aboutrika | the reveal («طلب») isn't in the hook and lands in [MID]; no claim about *which* metatarsal; no Omdurman-as-cause; on-screen «مش معروف أنهي مشط» |
| S2 Salah | «قطع حقيقي», the 16% re-injury figure, «لو جاهز»; no claim that coming off the bench was a planned staged return; no invented grade |
| S3 Mané | «اشتباه ارتجاج», «نفس اليوم», «مش لازم يبقى إغماء»; never «ارتجاج مؤكد» or blaming the medical staff |
| S4 Trezeguet | ACL, the 9-month data, the 69-study review; no graft type, no "the goal involved cutting", no "guarantee" |
| S5 El Shenawy | golf-ball analogy, 4 in 10; never "his first dislocation", "surgery", or his dislocation direction |
| S6 Essien | meniscus, «مافيهوش دم»; never the single-source medial-ligament detail or the conflicting knee side |
| S7 Zidan | «مفيش تشخيص معلن»; the hook doesn't give away the duel; no exact 76'/77' |
| SET | injuries unique · structures unique · hook openers unique · ≤1 referral ending |

Part A cases (`tests/cases.json`) carry over from v5, updated for EP01 = S1, EP02 = S7 and GEDO's science beat.

## Can't be automated
Whether a story is gripping, a line sounds like Hazem, or the science is explained *clearly*.
Use the rubric (`guides/rubric.md`), a read-aloud, and real analytics.
