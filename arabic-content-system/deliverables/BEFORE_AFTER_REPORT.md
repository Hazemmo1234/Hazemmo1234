# Before / after report: Round 1 v3 → v4

**Read this first.** Scores come from one editor (Claude) applying `system/RUBRIC.md` to all three versions in one sitting. They're editorial judgements, made visible so you can disagree with them line by line. **They don't predict Instagram retention, reach or saves.** Only your analytics can do that (see the testing plan in `EXECUTIVE_SUMMARY.md`). Durations are **estimates** from word counts, calibrated to v3's own syllable-based estimates. Nothing was recorded.

## Summary

| ID | v3 | pass 1 | final | Δ | v3 words → final | v3 est. → final est. | lint FAIL/WARN v3 → final | meets bar (≥80, accuracy ≥8, no Low band) |
|---|---|---|---|---|---|---|---|---|
| A1 | 68 | 76 | **81** | +13 | 77 → 85 | 35-43 → 39-48 s | 1/0 → 0/0 | yes |
| B1 | 65 | 75 | **79** | +14 | 74 → 77 | 34-42 → 35-43 s | 0/3 → 0/0 | **no** |
| A2 | 67 | 78 | **81** | +14 | 87 → 83 | 40-49 → 38-47 s | 0/2 → 0/0 | yes |
| B2 | 66 | 79 | **83** | +17 | 101 → 92 | 47-57 → 42-52 s | 0/0 → 0/0 | yes |
| B3 | 72 | 77 | **81** | +9 | 89 → 91 | 41-50 → 42-51 s | 0/0 → 0/0 | yes |
| EP01 | 75 | 77 | **81** | +6 | 123 → 103 | 57-69 → 47-58 s | 1/0 → 0/0 | yes |
| EP02 | 68 | 74 | **79** | +11 | 116 → 106 | 53-65 → 49-60 s | 0/1 → 0/0 | **no** |
| GEDO | 68 | 75 | **78** | +10 | 89 → 97 | 41-50 → 45-55 s | 0/1 → 0/0 | **no** |
| EP1 | 70 | 78 | **79** | +9 | 38 → 44 | 18-21 → 20-25 s | 0/0 → 0/0 | **no** |
| EP2 | 74 | 77 | **82** | +8 | 36 → 43 | 17-20 → 20-24 s | 0/0 → 0/0 | yes |
| EP3 | 69 | 74 | **80** | +11 | 40 → 44 | 18-23 → 20-25 s | 0/0 → 0/0 | yes |
| EP5 | 65 | 74 | **80** | +15 | 45 → 40 | 21-25 → 18-23 s | 0/0 → 0/0 | yes |
| **avg** | 68.9 | 76.2 | **80.3** | +11.4 | | | | 8/12 |

**8 of 12 scripts meet the quality bar. 4 sit at 78–79**, and each one's limiting factor is named below. For those four, further gains need a decision from Hazem (a format change, a benchmark choice, or cutting story detail), not more polishing.

Automated checks (reproducible: `python3 -I tools/lint_scripts.py <dir>` and `python3 -I tests/run_regression.py <dir>`):

| | v3 original | v4 pass 1 | v4 final |
|---|---|---|---|
| lint FAIL | 2 | 5 | 0 |
| lint WARN | 8 | 3 | 0 |
| «مش X… Y» reveals (total) | 9 | 0 | 0 |
| spoken disclaimers (total) | 7 | 0 | 0 |
| generic referral endings | 4 | 0 | 0 |
| regression suite | 2/13 passed | 6/13 passed | 13/13 passed |

Note on the regression numbers: some assertions encode v4 decisions (for example, specific payoff keywords and corrected sentences), so v3 failing them is not independent evidence. The independent signals are the generic checks: length, contrast count, disclaimers, referral endings, MSA markers and duplicated conditions.

## What pass 1 got wrong (and pass 2 fixed)

- **Length:** pass 1 removed every contrast tic and disclaimer, but added content. 5 scripts went over target (A1 50–61 s vs 35–45). Pass 2 compressed without moving the targets.
- **A repeated hook shape:** 4 of 5 approved reels opened with a question. A2 now opens on a number, and B3 on its original command.
- **Excessive rewriting:** pass 1 replaced B3's hook, the strongest do-it-now line in the PDF. Pass 2 restored it, and the regression suite now protects it.
- **A repeated ending shape:** A2's ending mirrored B1's (pain vs X). A2 now ends on a reframe question.
- **Unspeakable lines** found on the read-aloud: «لووه» → «لواه»، «قدام» → «قصاد»; a double «بس» in EP5; the 40-day figure lost its source («الأهلي بيقول» restored).

## Scientific corrections

| ID | v3 | Problem | v4 | Source checked |
|---|---|---|---|---|
| EP5 | «مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم» | Says cardio is useless for muscle; the PDF's own note and the meta-analysis say gains are smaller, not zero | «عضلهم زاد… بس أقل» + running vs cycling + «عجلة أكتر، وجري أقصر» | Wilson 2012, J Strength Cond Res, doi:10.1519/JSC.0b013e31823a3e2d |
| EP3 | «وفاكره هيحميك من الإصابات؟ لوحده كده… مالوش لازمة» | The review finds no clear effect on all-cause/overuse injuries, but recommends stretching *within a dynamic warm-up* to reduce muscle injuries | «لوحده، الدليل مش واضح. جوه تسخين فيه حركة، ممكن يقلل إصابات العضل» | Behm 2016, Appl Physiol Nutr Metab, doi:10.1139/apnm-2015-0235 |
| GEDO | «والكاف بعدها سمّته «السوبر سَب»» | The cited source documents the nickname, not that CAF gave it | «واتعرف بعدها بلقب «السوبر سَب»» | Ahram Online 2021 (as cited in v3) |
| EP1 | «مالوش لازمة لو مالوش علاقة باللي هتلعبه» | Too vague to verify or act on | Concrete conditions tied to McGowan 2015 / Bishop 2003 | McGowan 2015, Sports Med, doi:10.1007/s40279-015-0376-x |

Everything else in v3 that I checked matched its source; the additions in v4 were all checked. A1 1.4× (Sun 2015, doi:10.1249/MSS.0000000000000404) · A2 522, 33% → 22% (Hupperets 2009, doi:10.1136/bmj.b2684) · B2 n = 38 and n = 39 (Silbernagel 2007, doi:10.1177/0363546506298279; Kongsgaard 2009, doi:10.1111/j.1600-0838.2009.00949.x) · EP2 15RM → 6RM (Kongsgaard 2009 full text) · B3 MDC 1.6–1.9 cm (Powden 2015, doi:10.1016/j.math.2015.01.004) · GEDO substitutes' high-intensity running (Bradley 2014, doi:10.1123/ijspp.2013-0304; Bradley & Noakes 2013, doi:10.1080/02640414.2013.796062) · van Dyk 2019, doi:10.1136/bjsports-2018-100045 · Grindem 2016, doi:10.1136/bjsports-2016-096031. All retrieved via PubMed in this session.

## Recurring weaknesses found in v3

| # | Weakness | Evidence | Viewer effect |
|---|---|---|---|
| 1 | **Reflexive «مش X… Y» contrast reveals** | 9 hits: A1 (3), B1 (2), A2 (2), GEDO (2) (lint) | Each line argues with a belief the viewer didn't state; the rhythm becomes predictable and reads as generated. |
| 2 | **Spoken disclaimers mid-flow** | B1 ×2, A2 ×2, B2, B3, GEDO (lint) | Honest, but they stop momentum where attention is most fragile. Most of them were already on screen. |
| 3 | **Default "see a professional" ending** | 4 of 5 approved reels («اتقيّم» ×2، «كلّم مختص»، «وريه لمختص») | Repetitive across the account, gives no takeaway, and positions Hazem as a referrer rather than the expert. |
| 4 | **Stories over their own target** | EP01 est. 57–69 s and EP02 53–65 s vs the section's 45–55 s | The strongest material risks losing viewers before the payoff. |
| 5 | **Series claims stronger than the evidence** | EP5 contradicts its own «مش بنقول» note; EP3's injury line conflicts with Behm 2015's recommendation | Credibility risk; a clip shared out of context says something the science doesn't. |
| 6 | **Vague conditions in the series** | «لو مالوش علاقة باللي هتلعبه»، «لو نوعه مش ماشي مع هدفك»; «مالوش علاقة» reused in EP1 and EP2 | Viewers can't act on a vague condition; the series starts to feel templated. |
| 7 | **Payoffs that defer rather than deliver** | B3 measures but gives no use for the number; B2 ends on «يتظبط على قد حالتك» | The hook's implied promise ("you'll know…") is only half kept. |

**What the PDF already does well (preserved):** strict «مؤكد / ممنوع يتقال» discipline in the
stories; on-screen labels for sample sizes and graphics; several lines that already sound
like a coach talking («العضمة مالهاش دعوة الماتش قد إيه مهم»، «التمرين اللي مابيتقلش
ومابيتقاسش…»، «هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش»، «الإصابة بتنزّله، والتأهيل
بيطلّعه تاني»); a good balance of formats (graphics, demo, voice-over, story, series).

**Not found (checked, absent):** stock AI phrases («خليني أقولك»، «السر اللي…»), em
dashes in spoken text, fabricated citations. I checked 12 of the PDF's scientific references
against PubMed or full text (Sun 2015, van Dyk 2019, Hupperets 2009, Silbernagel 2007, Kongsgaard
2009, Powden 2015, Behm 2015/16, Wilson 2012, Grindem 2016, McGowan 2015, Bradley 2014, Bradley &
Noakes 2013). All exist and support how the PDF uses them, except the overstatements in EP3 and EP5.
Not re-checked: Bishop 2003, Ekstrand & van Dijk 2013, Soligard 2008, and the news sources behind
the stories (tournament facts were confirmed independently).

## Per-script comparison

### A1 · لما الهامسترينج بيشيل أعلى حمل → لحظتين الهامسترينج فيهم شايل أتقل حمل

**Score:** v3 68 → pass 1 76 → **final 81** · words 77 → 85 · est. من 35 لـ 43 ث → من 39 لـ 48 ث (estimate)

**Diagnosis (v3)**

- **Weak:** 3 contrast reveals in 77 words; ends on «اتقيّم».
- **Why it matters:** the contrasts turn a mechanism explanation into a string of corrections; the ending gives the viewer nothing to do.
- **Change:** keep one contrast (stretching vs loaded lengthening), add the escalating 1.4× number, end with an audit question.
- **Preserve:** the two-moment mechanism, «الأسباب كتير», the program-level framing of the Nordic.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** أكبر حمل بيشيله الهامسترينج مش وانت بتستريتش. وانت بتجري. وفي لحظتين بالذات. | **الهوك** فيه لحظتين في الجري السريع، الهامسترينج فيهم شايل أتقل حمل. |
| لما رجلك بتترمي لقدام قبل ما تنزل، وأول ما تلمس الأرض. | رجلك طايرة لقدام قبل ما تنزل… وأول ما تخبط الأرض. |
| **هوك النص** في اللحظتين دول العضلة بتطول وهي شغالة. يعني بتفرمل رجلك. | وفيهم العضلة بتتمط وهي شادّة، بتفرمل الركبة. |
| عشان كده الوقاية مش ستريتش وخلاص. لازم تقوّيها وهي بتطول. | **هوك النص** وعند عدّائين نخبة، الحمل ده عدّى أقصى قوة تطلّعها العضلة وهي ثابتة… بحوالي 40%. |
| البرامج اللي فيها تمرين النوردك اتجربت على أكتر من 8 آلاف رياضي، وقللت إصابات الهامسترينج لحوالي النص. البرنامج كله، مش النوردك لوحده. | الستريتش بيمط العضلة وهي مرتاحة. اللحظة دي محتاجة عضلة قوية وهي بتتمط. |
| **الختام** ولو الشد بيرجعلك كل شوية، اتقيّم. الأسباب كتير، ومش شرط تكون ضعف. | وده اللي بيدرّبه النوردك: البرامج اللي فيها قللت إصابات الهامسترينج للنص تقريبًا. |
|  | **الختام** فلو الشد الخلفي بيرجعلك: آخر مرة عضلتك اتدرّبت وهي بتتمط تحت حمل… كانت إمتى؟ الأسباب كتير، بس ابدأ من هنا. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 12 | v3: (J) «أكبر حمل… مش وانت بتستريتش. وانت بتجري» is specific, and the stretching contrast is a real scroll-stopper.<br>v4: (J) «فيه لحظتين في الجري السريع، الهامسترينج فيهم شايل أتقل حمل» is specific and visual, but less provocative than v3's stretching contrast. v3's hook is kept as [ALT] for an A/B test. Only +1. |
| Narrative & middle hook (20) | 13 | 16 | v3: (J) Logical order, but the «هوك النص» only restates the mechanism. The Nordic stat arrives with no bridge.<br>v4: (J) Moment → mechanism → escalating number («عدّى أقصى قوة… بحوالي 40%») → myth correction → proof → audit question. Each beat is new. |
| Egyptian voice (15) | 10 | 13 | v3: (F) 3 contrast reveals in 77 words (lint). «البرنامج كله، مش النوردك لوحده» is a written-style afterthought.<br>v4: (F) 0 contrast reveals; «بتتمط وهي شادّة، بتفرمل الركبة» is natural gym Egyptian. |
| Relevance (10) | 7 | 8 | v3: (J) Runners and footballers, but no lived situation is named.<br>v4: (J) The ending addresses the viewer whose strain keeps coming back. |
| Originality (10) | 7 | 8 | v3: (J) The lengthening-under-load mechanism plus the 'programme, not exercise alone' nuance is above typical IG content.<br>v4: (J) The 40% figure is uncommon in Arabic fitness content (judgement, not checked against competitors). |
| Clarity & efficiency (10) | 7 | 8 | v3: (F) 35–43 s est., within range; the trailing qualifier clutters the ending.<br>v4: (F) 85 words, est. 39–48 s, at the upper edge of the target. |
| Practical value (10) | 4 | 7 | v3: (F) Ends on «اتقيّم» with no action.<br>v4: (J) The audit question «آخر مرة عضلتك اتدرّبت وهي بتتمط تحت حمل… كانت إمتى؟» is actionable, but there's no how-to for the Nordic. Remaining weakness. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) Both claims match Sun 2015 and van Dyk 2019; the shooting note flags the mechanism as probable.<br>v4: (F) Sun 2015: knee muscle torque 1.4× max isometric in initial stance (n = 8, on screen). van Dyk 2019 RR 0.49 for programmes including the NHE. «الأسباب كتير» keeps it multifactorial. |

**Pass 1:** Fixed the contrast tic and added the 1.4× number as an escalating middle hook, but grew to 109 words (est. 50–61 s vs 35–45). Lint FAIL: too_long.

**Main change / remaining weakness:** Contrast tic removed, escalating middle hook added, generic referral replaced by an audit question. Hook not clearly better than v3, so v3's is kept as ALT.

### B1 · الفجوة بين «الوجع راح» و«جاهز» → الفجوة بين «الوجع راح» و«جاهز»

**Score:** v3 65 → pass 1 75 → **final 79** · words 74 → 77 · est. من 34 لـ 42 ث → من 35 لـ 43 ث (estimate)

**Diagnosis (v3)**

- **Weak:** vague hook («بالحاجة الغلط»), MSA «فإن», 2 spoken disclaimers, abstract test list.
- **Change:** name the wrong measure (pain), move the disclaimers to screen, name testable domains.
- **Preserve:** the line model, «الإصابة بتنزّله، والتأهيل بيطلّعه تاني», the «نص الطريق» middle hook.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** الوجع راح، رجعت تلعب، واتصبت تاني؟ يمكن كنت بتقيس بالحاجة الغلط. | **الهوك** الوجع راح، رجعت تلعب، واتصبت تاني؟ يمكن كنت بتقيس جاهزيتك بالوجع. |
| الرسم ده للتوضيح، مش أرقام. | الخط ده: قد إيه جسمك يستحمل. تحت: مشي وسلم وشغل. فوق: ماتش وسبرنت وتغيير اتجاه. |
| الخط ده قد إيه جسمك يستحمل. تحت: المشي والسلم والشغل. فوق: الماتش والجيم والجري. | الإصابة بتنزّله، والتأهيل بيطلّعه تاني. |
| الإصابة بتنزّله، والتأهيل بيطلّعه تاني. | **هوك النص** والمشكلة إن الوجع بيختفي هنا… في نص الطريق. تحس إنك تمام، وجسمك لسه مايستحملش الماتش. |
| **هوك النص** بس الوجع ممكن يروح وانت لسه هنا، في نص الطريق، وبعيد عن اللي رياضتك عايزاه. وده بيفرق من واحد للتاني. | طب تعرف إزاي إنك وصلت فوق؟ تختبر: قوة رجلك المصابة قصاد السليمة، النط عليها لوحدها، وتغيير الاتجاه من غير تردد. |
| **الختام** فإن الوجع راح، ده لوحده مش معناه إنك جاهز. الجاهزية بتتقاس: قوة، ونط، ونَفَس، قدام اللي رياضتك هتطلبه منك. | **الختام** الوجع بيقولك إن الإصابة هديت. الاختبارات هي اللي بتقولك إنك رجعت. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 10 | 12 | v3: (J) Relatable scenario, but «بالحاجة الغلط» is vague. It doesn't say what was being measured.<br>v4: (J) «يمكن كنت بتقيس جاهزيتك بالوجع» names the specific mistake while keeping v3's honest «يمكن». |
| Narrative & middle hook (20) | 12 | 15 | v3: (J) The line model is good and «الوجع ممكن يروح وانت لسه هنا» is a genuine middle hook, but a disclaimer opens the body.<br>v4: (J) Model → middle hook (kept from v3) → «طب تعرف إزاي إنك وصلت فوق؟» opens a second question that the tests answer. |
| Egyptian voice (15) | 9 | 13 | v3: (F) MSA «فإن الوجع راح», 2 contrast reveals, a spoken disclaimer «الرسم ده للتوضيح، مش أرقام».<br>v4: (F) MSA and contrast reveals removed; «قصاد السليمة» is natural comparison Egyptian. |
| Relevance (10) | 8 | 8 ⚠ not improved | v3: (J) The return-to-sport viewer will recognise it.<br>v4: (J) Unchanged. Already good in v3. |
| Originality (10) | 6 | 7 | v3: (J) The capacity-gap concept is known in rehab circles, though rarer in Egyptian IG.<br>v4: (J) +1: the ending reframes pain as a signal of healing, not of readiness. Still a known concept. |
| Clarity & efficiency (10) | 6 | 8 | v3: (F) 2 spoken disclaimers (~13 of 74 words).<br>v4: (F) 77 words, est. 35–43 s, on target; disclaimer on screen; CTA moved to the caption. |
| Practical value (10) | 5 | 7 | v3: (J) «قوة، ونط، ونَفَس» lists categories, not tests.<br>v4: (J) Names three test domains but gives no thresholds. Adding sport-specific criteria (e.g. ≥90% limb symmetry, from ACL literature) is Hazem's call. Remaining weakness. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) No numbers; the on-screen label prevents the graphic being read as data.<br>v4: (F) Unchanged; nothing overstated. |

**Pass 1:** Hook names the wrong measure («بالوجع»), disclaimer moved on screen, tests named, but 93 words (est. 43–52 s vs 34–42). Lint FAIL.

**Main change / remaining weakness:** Below the 80 bar (79). Moving practical value needs a decision on whether to state a benchmark that comes from ACL-specific research.

### A2 · الوجع بيمشي قبل ما الكاحل يرجع → الالتواء التاني

**Score:** v3 67 → pass 1 78 → **final 81** · words 87 → 83 · est. من 40 لـ 49 ث → من 38 لـ 47 ث (estimate)

**Diagnosis (v3)**

- **Weak:** generic opening; disclaimer line; referral ending.
- **Change:** lead with the resprain number; fold "not a test" into the demo line and the screen; end on a reframe.
- **Preserve:** the trial numbers, the wall demo.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** كاحلك بطّل يوجعك؟ حلو. بس ده مش معناه إنه رجع زي الأول. | **الهوك** واحد من كل تلاتة رياضيين لووا كاحلهم، لواه تاني في نفس السنة. |
| فيه تجربة على أكتر من 500 رياضي اتلوى كاحلهم. حوالي تلت اللي كمّلوا علاجهم العادي، اتلوى تاني في خلال سنة. | ده في تجربة على أكتر من 500 رياضي، خدوا علاجهم العادي. |
| **هوك النص** أما اللي زوّدوا تمارين توازن في البيت 8 أسابيع، النسبة نزلت لحوالي 22%. يعني التمرين فرق، حتى بعد ما الوجع راح. | **هوك النص** مجموعة تانية عملت نفس العلاج، وزوّدت تمارين توازن في البيت 8 أسابيع. الالتواء التاني نزل لحوالي 22%. |
| عايز تلاحظ بنفسك؟ اقف جنب حيطة، وإيدك قريبة منها، على رجل واحدة. وبعدين التانية. | يعني الكاحل محتاج يتدرّب إنه يسندك وانت على رجل واحدة، حتى بعد ما يخف. |
| ده مش اختبار ولا تشخيص، ولا هو البرنامج اللي في التجربة. مجرد ملاحظة. | جرّب دلوقتي: اقف جنب حيطة، إيدك قريبة منها، على رجل واحدة. وبعدين التانية. لو رجل بتتهز أكتر، دي معلومة تستاهل تشتغل عليها. |
| **الختام** ولو لقيت فرق واضح ومضايقك، كلّم مختص. | **الختام** فبعد الالتواء، ماتسألش «لسه بيوجع؟». اسأل «بيسندني؟». |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 9 | 13 | v3: (J) «كاحلك بطّل يوجعك؟ حلو. بس ده مش معناه…» is a common take that opens on a contrast.<br>v4: (J) «واحد من كل تلاتة رياضيين لووا كاحلهم، لواه تاني في نفس السنة» is a hard number, immediately relevant, and a statement (fixes the batch's question-hook pattern). |
| Narrative & middle hook (20) | 13 | 15 | v3: (J) Number → better number → demo, but a disclaimer line («ده مش اختبار ولا تشخيص… مجرد ملاحظة») stalls the end.<br>v4: (J) Number → comparison middle hook (22%) → implication → demo → reframe. |
| Egyptian voice (15) | 10 | 13 | v3: (F) 2 contrast reveals plus a spoken disclaimer.<br>v4: (F) 0 contrast reveals, 0 spoken disclaimers. |
| Relevance (10) | 8 | 8 ⚠ not improved | v3: (J) Anyone who's sprained an ankle.<br>v4: (J) Unchanged. |
| Originality (10) | 6 | 7 | v3: (J) The proprioception-after-sprain message is fairly common.<br>v4: (J) +1: the closing reframe «ماتسألش «لسه بيوجع؟». اسأل «بيسندني؟»» is memorable. |
| Clarity & efficiency (10) | 6 | 8 | v3: (F) 40–49 s est., about 10% of words are disclaimer.<br>v4: (F) 83 words, est. 38–47 s. |
| Practical value (10) | 6 | 8 | v3: (J) The demo is useful, but it ends on «كلّم مختص».<br>v4: (J) Do-it-now demo plus a question the viewer can keep using. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) 500+, ~1/3 and 22% match Hupperets 2009 (522; 33% vs 22%).<br>v4: (F) Absolute numbers (33%→22%) on screen; the hook generalises one trial's control group, and the next line names the trial. |

**Pass 1:** Number hook, disclaimers moved on screen, demo kept. Ending shape duplicated B1 (pain vs X aphorism). Question hook (4/5 approved reels opened with a question).

**Main change / remaining weakness:** Clear improvement in hook, flow and language; accuracy unchanged (already correct).

### B2 · وتر بيوجع: ظبّط الحمل، ماتوقفش وخلاص → وتر بيوجع: الرأي التالت

**Score:** v3 66 → pass 1 79 → **final 83** · words 101 → 92 · est. من 47 لـ 57 ث → من 42 لـ 52 ث (estimate)

**Diagnosis (v3)**

- **Weak:** vague tease «ساعات الإجابة بتبقى في النص»; the longest approved reel; abstract ending plus referral.
- **Change:** frame the two options the viewer is offered; deliver the pain-monitoring rule as the payoff.
- **Preserve:** both trials, described separately; "slow and heavy".

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** وتر بيوجعك. تريّحه خالص؟ ولا تكمّل عادي؟ ساعات الإجابة بتبقى في النص. | **الهوك** وترك بيوجعك؟ قدامك اختيارين مشهورين: تريّحه خالص، أو تاخد حقنة. التجارب ليها رأي تالت. |
| إنك تخفف الحمل فترة، ده ممكن يبقى صح. بس الراحة لوحدها لفترة طويلة غالبًا مش بترجّع للوتر قدرته. | في تجربة على وتر أكيليس: نص الناس وقفوا جري ونط 6 أسابيع، والنص التاني كمّلوا… بس بحدود للوجع. |
| **هوك النص** في تجربة على وتر أكيليس، ناس كمّلت جري ونط بحدود، وعينها على الوجع، واتحسنوا زي اللي وقفوا خالص 6 أسابيع. | **هوك النص** والاتنين اتحسنوا قد بعض. |
| وفي تجربة تانية على وتر الركبة، 39 راجل بس: اللي عملوا مقاومة تقيلة وبطيئة فضلوا كويسين لحد 6 شهور. واللي خدوا حقنة كورتيزون، التحسن ماكملش. | وفي تجربة على وتر الركبة: الحقنة ريّحت بسرعة، وبعد 6 شهور التحسن رجع لورا. اللي فضلوا كويسين كانوا اللي اتمرنوا بمقاومة، خصوصًا التقيلة والبطيئة. |
| تجربتين صغيرين، على وترين مختلفين. مش قاعدة لكل الناس. | تجربتين صغيرين، بس الاتجاه واحد: الوتر بيتحسن بالحمل المظبوط. تشتغل بوجع خفيف ومقبول، وتراقبه لحد تاني يوم الصبح. |
| **الختام** اللي بيفرق إن الحمل يتظبط على قد حالتك، ويزيد واحدة واحدة. ولو الوجع جامد أو بيزيد، اتقيّم. | **الختام** هدي لحد الصبح؟ كمّل وزوّد واحدة واحدة. زاد يوم عن يوم؟ خفف الحمل، ماتوقفش. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 8 | 12 | v3: (J) Two stacked questions plus the vague tease «ساعات الإجابة بتبقى في النص».<br>v4: (J) «قدامك اختيارين مشهورين… التجارب ليها رأي تالت» is a concrete choice with a real gap. |
| Narrative & middle hook (20) | 13 | 16 | v3: (J) Two trials in sequence work; the spoken disclaimer «مش قاعدة لكل الناس» deflates the middle.<br>v4: (J) Prediction → result («والاتنين اتحسنوا قد بعض») → stakes reveal («بعد 6 شهور التحسن رجع لورا») → rule. |
| Egyptian voice (15) | 11 | 13 | v3: (J) Natural, but written-register stretches («إنك تخفف الحمل فترة، ده ممكن يبقى صح»).<br>v4: (F) No disclaimers or contrasts; «هدي لحد الصبح؟ كمّل… زاد يوم عن يوم؟ خفف» sounds spoken. |
| Relevance (10) | 7 | 8 | v3: (J) 'Tendon' is abstract; no situation.<br>v4: (J) +1: names the two options the viewer is actually offered. |
| Originality (10) | 8 | 8 ⚠ not improved | v3: (J) Injection vs heavy slow resistance is a distinctive comparison.<br>v4: (J) Unchanged; already distinctive. |
| Clarity & efficiency (10) | 5 | 8 | v3: (F) Longest approved reel (47–57 s est.) with a disclaimer line.<br>v4: (F) 92 words, est. 42–52 s. |
| Practical value (10) | 5 | 9 | v3: (J) «يتظبط على قد حالتك» is abstract, and it ends on «اتقيّم».<br>v4: (J) The next-morning pain rule is an action the viewer can apply tonight. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) Silbernagel (n = 38) and Kongsgaard (n = 39) described correctly.<br>v4: (F) Both trials are on cards with their n; the trials are not conflated; no pain-score number given (secondary sources conflict). |

**Pass 1:** 'Third option' hook, pain-monitoring rule as payoff; 100 words (est. 46–56 s vs 40–50).

**Main change / remaining weakness:** Biggest gain in practical value.

### B3 · اختبار الركبة للحيطة: بيقيس إيه وما بيقيسش إيه → اختبار الركبة للحيطة: الرقم اللي يستاهل تعيده

**Score:** v3 72 → pass 1 77 → **final 81** · words 89 → 91 · est. من 41 لـ 50 ث → من 42 لـ 51 ث (estimate)

**Diagnosis (v3)**

- **Weak:** «هامش خطأ» unquantified; no use for the measurement; referral ending.
- **Change:** quantify the measurement error (≈2 cm), turn the number into a re-test tool.
- **Preserve:** the hook (strongest do-it-now in the PDF) and the instructions.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** اقف قدام حيطة، وفي 30 ثانية هتعرف كاحلك بيتني لقدام قد إيه. | **الهوك** اقف قدام حيطة، وفي 30 ثانية هتعرف كاحلك بيتني لقدام قد إيه. |
| الكعب لازق في الأرض، وزق ركبتك لحد ما تلمس الحيطة. | الكعب لازق في الأرض، وزق ركبتك للحيطة. ارجع برجلك لورا حتة حتة، لحد آخر نقطة الركبة بتلمس فيها والكعب مارفعش. وقيس المسافة لصباعك الكبير. |
| ارجع برجلك لورا حتة حتة، لحد آخر نقطة الركبة لسه بتوصل فيها والكعب مارفعش. وبعدين جرّب الرجل التانية. | **هوك النص** لقيت فرق بين الرجلين؟ استنى. القياس ممكن يختلف لحد 2 سنتي لو عدته. فالفرق الصغير ماتبنيش عليه. |
| **هوك النص** لقيت فرق بين الرجلين؟ استنى قبل ما تقلق. القياس ده نفسه فيه هامش خطأ، ومش كل فرق يبقى مشكلة. | والاختبار ده بيقيس الكاحل وبس: مابيقولكش ركبتك بتوجعك ليه، ولا ليه كعبك بيترفع في السكوات. |
| وهو بيقيس حاجة واحدة: كاحلك في الحركة دي. لكن مش هيقولك ركبتك بتوجعك ليه. | **الختام** اكتب الرقم، اشتغل على الكاحل، وعيده بعد أسابيع. اتحرك أكتر من 2 سنتي؟ ده غالبًا تغيير حقيقي. |
| **الختام** لو عندك وجع، أو الفرق ده مضايقك وانت بتتحرك، وريه لمختص يقولك ده معناه إيه بالنسبالك. | **CTA** اكتبلي رقم كل رجل في الكومنتات. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 13 | 13 ⚠ not improved | v3: (J) «اقف قدام حيطة، وفي 30 ثانية هتعرف…» is a strong do-it-now hook. Preserved.<br>v4: (J) v3 hook restored (pass 1 had replaced a strong line: an excessive-rewrite error caught in review). |
| Narrative & middle hook (20) | 12 | 15 | v3: (J) Clear instructions, but the middle hook «فيه هامش خطأ» is vague, and the script ends by deferring.<br>v4: (J) Instructions → a concrete middle hook («ممكن يختلف لحد 2 سنتي لو عدته») → limits → re-test payoff. |
| Egyptian voice (15) | 12 | 12 ⚠ not improved | v3: (J) Natural instruction language.<br>v4: (J) Unchanged. Already natural. |
| Relevance (10) | 6 | 7 | v3: (J) Doesn't say why the viewer should care about ankle bend.<br>v4: (J) +1: squat heel-rise is mentioned, but later and weaker than in pass 1. A trade-off. |
| Originality (10) | 7 | 8 | v3: (J) The knee-to-wall test is known; the honest framing is good.<br>v4: (J) Using the measurement error to tell real change from noise is rare in IG content (judgement). |
| Clarity & efficiency (10) | 8 | 8 ⚠ not improved | v3: (F) 41–50 s est.<br>v4: (F) 91 words, est. 42–51 s. |
| Practical value (10) | 5 | 9 | v3: (F) No measurement, no use for the number; ends on «وريه لمختص».<br>v4: (J) Measure → train → re-test, with a threshold. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) Correctly avoids normal values.<br>v4: (F) Powden 2015 MDC 1.6–1.9 cm; applying it to between-leg differences is flagged as an approximation in NOTES. |

**Pass 1:** Replaced the hook with a squat question (lost the strong v3 hook), added MDC and re-test logic; 115 words (est. 53–65 s vs 38–47). Lint FAIL.

**Main change / remaining weakness:** Practical value from 5 to 9. Relevance gain smaller than in pass 1 because the strong v3 hook was kept.

### EP01 · أبو تريكة: لما قال «لسه» → أبو تريكة: لما قال «لسه»

**Score:** v3 75 → pass 1 77 → **final 81** · words 123 → 103 · est. من 57 لـ 69 ث → من 47 لـ 58 ث (estimate)

**Diagnosis (v3)**

- **Weak:** over target length; «فاته لقب 2010» is ambiguous (Egypt won); opening contrast.
- **Change:** a sharper hook («بطلب منه هو»), compression.
- **Preserve:** the middle-hook turn, «العضمة مالهاش دعوة…», and the ending, verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** أبو تريكة، صاحب جول نهائي 2008، فاته لقب 2010 كله. ومش بسبب حاجة حصلت في أنجولا. | **الهوك** أبو تريكة، صاحب جول نهائي 2008، غاب عن بطولة 2010 كلها. بطلب منه هو. |
| 21 نوفمبر 2009، بعد أم درمان بتلات أيام، في تمرين الأهلي: وجع في وش القدم، وشرخ في الأشعة. واتحدد بعدها: كسر إجهادي في مشط القدم. | 21 نوفمبر 2009، تلات أيام بعد أم درمان، في تمرين الأهلي: كسر إجهادي في مشط القدم. |
| وفي آخر ديسمبر، الأهلي لسه بيقول محتاج حوالي 40 يوم. والبطولة بتبدأ 10 يناير. | آخر ديسمبر، الأهلي بيقول لسه محتاج حوالي 40 يوم. والبطولة بتبدأ 10 يناير. |
| **هوك النص** شحاتة كان مستعد يستناه. بس أبو تريكة قال بعد سنين إنه هو اللي طلب مايتضمّش… لأنه مش عارف هيخف إمتى. | **هوك النص** شحاتة كان مستعد يستناه. بس أبو تريكة قال بعد سنين إنه هو اللي طلب مايتضمّش… لأنه مش عارف هيخف إمتى. |
| وده الفرق بين إنك عايز تلعب، وإنك جاهز. العضمة مالهاش دعوة الماتش قد إيه مهم. الكسر ده محتاج وقت يلحم، وبعدها رجوع بالتدريج. ولو اتحمّل بدري، ممكن يتأخر أو يرجع يتكسر. | العضمة مالهاش دعوة الماتش قد إيه مهم. الكسر ده محتاج وقت يلحم، وبعدها رجوع بالتدريج. ولو اتحمّل بدري، ممكن يتأخر أو يرجع يتكسر. |
| **الختام** ومصر كسبت التالتة على التوالي من غيره. وأوقات أصعب قرار في الرجوع من إصابة… إنك تقول: لسه. | **الختام** ومصر كسبت التالتة على التوالي من غيره. وأوقات أصعب قرار في الرجوع من إصابة… إنك تقول: لسه. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 13 | v3: (J) Name plus mystery, but «فاته لقب 2010 كله» is ambiguous (Egypt won it) and it opens on a contrast.<br>v4: (J) «غاب عن بطولة 2010 كلها. بطلب منه هو» is a sharper surprise, and attributed in the middle hook. |
| Narrative & middle hook (20) | 16 | 16 ⚠ not improved | v3: (J) Real turn («شحاتة كان مستعد يستناه. بس…»), science bridge, earned ending.<br>v4: (J) Unchanged. Already strong. |
| Egyptian voice (15) | 13 | 13 ⚠ not improved | v3: (J) Natural; «العضمة مالهاش دعوة الماتش قد إيه مهم» is the best line in the PDF.<br>v4: (J) Unchanged; protected lines kept verbatim. |
| Relevance (10) | 7 | 7 ⚠ not improved | v3: (J) Football fans; the injury lesson is indirect.<br>v4: (J) Not improved. Story format. |
| Originality (10) | 9 | 9 ⚠ not improved | v3: (J) Uses a national story to teach readiness. Distinctive.<br>v4: (J) Unchanged. |
| Clarity & efficiency (10) | 4 | 8 | v3: (F) Est. 57–69 s against the section's own 45–55 s target.<br>v4: (F) 103 words, est. 47–58 s (was 57–69). |
| Practical value (10) | 6 | 6 ⚠ not improved | v3: (J) A decision lesson, not an action.<br>v4: (J) Not improved: the story teaches a decision, not a drill. Acceptable for this series. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) Careful «ممنوع يتقال» discipline; tournament facts confirmed independently this session.<br>v4: (F) Unchanged; «الأهلي بيقول» keeps the 40-day figure attributed. |

**Pass 1:** New hook «بطلب منه هو»; still 121 words (est. 56–68 s). Lint FAIL.

**Main change / remaining weakness:** Mainly a compression and hook edit. The protected lines are untouched.

### EP02 · زيدان: رجع بالدقايق… وكسب الالتحام → زيدان: الالتحام اللي جاب البطولة

**Score:** v3 68 → pass 1 74 → **final 79** · words 116 → 106 · est. من 53 لـ 65 ث → من 49 لـ 60 ث (estimate)

**Diagnosis (v3)**

- **Weak:** the payoff (the famous duel) is hidden behind three sentences of context; the three injury accounts are read aloud.
- **Change:** payoff-first cold open; accounts on a card.
- **Preserve:** «لسه مش عارف», the minutes, the ending line.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** زيدان فوّت لقب 2006 عشان ناديه. في 2008 اختار المنتخب عشان يعيش إحساس البطل… وقبل ربع النهائي، كاحله وقّف كل حاجة. | **الهوك** الالتحام اللي جاب جول نهائي 2008، عمله لاعب كاحله كان متصاب من حوالي أسبوع. |
| ماتش أنجولا اتلعب من غيره. طب اتعور إزاي؟ تلات روايات: في التسخين، ولا حفرة في التمرين، ولا التحام مع أحمد فتحي، زي ما قال هو بعد 16 سنة. | زيدان فوّت بطولة 2006 عشان ناديه، وجه 2008 عشان يعيش إحساس البطل. وقبل ربع النهائي، كاحله اتصاب. |
| **هوك النص** قبل نص النهائي بيوم اتسأل: جاهز؟ قال: لسه مش عارف. ونزل بديل في الدقيقة 69. وفي النهائي، بديل تاني، في الدقيقة 59. | إزاي؟ فيه تلات روايات، ومحدش يعرف مين الصح. |
| مانعرفش ليه نزل بديل. بس الكاحل كده بيرجع للكورة: المشي بيرجع بدري، لكن الماتش عايز جري وفرملة ولف والتحامات. | **هوك النص** قبل نص النهائي اتسأل: جاهز؟ قال: لسه مش عارف. ونزل بديل دقيقة 69. وفي النهائي، بديل تاني، دقيقة 59. |
| **الختام** وفي الدقيقة 77، سونج، كابتن الكاميرون، دخل معاه في التحام وخسر الكورة. زيدان عملها لأبو تريكة: جول البطولة. من التحام… نفس الحاجة اللي الكاحل بيتعب يرجعلها. | مانعرفش ليه نزل بديل. بس لو كاحلك انت اتلوى: إنك تمشي من غير وجع ده أول الطريق. الماتش عايز جري وفرملة ولف والتحامات. |
|  | **الختام** دقيقة 77: سونج، كابتن الكاميرون، دخل معاه في التحام وخسر الكورة. زيدان عملها لأبو تريكة: جول البطولة. من التحام… نفس الحاجة اللي الكاحل بيتعب يرجعلها. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 9 | 13 | v3: (J) Three sentences of setup before the hook lands; the famous payoff is hidden.<br>v4: (J) «الالتحام اللي جاب جول نهائي 2008، عمله لاعب كاحله كان متصاب من حوالي أسبوع» opens on the famous moment. |
| Narrative & middle hook (20) | 14 | 16 | v3: (J) Good turn and ending, but listing the three injury accounts costs about 8 s.<br>v4: (J) Cold open → context → «لسه مش عارف» turn → the minutes → payoff that closes the loop. |
| Egyptian voice (15) | 12 | 13 | v3: (J) Natural.<br>v4: (J) +1 from cutting the three-account list. |
| Relevance (10) | 6 | 7 | v3: (J) Football fans; weak link to the viewer.<br>v4: (J) +1: «لو كاحلك انت اتلوى» brings the viewer in. |
| Originality (10) | 8 | 8 ⚠ not improved | v3: (J) The 'won it with a duel on a bad ankle' angle is strong.<br>v4: (J) Unchanged. |
| Clarity & efficiency (10) | 5 | 7 | v3: (F) Est. 53–65 s vs 45–55 s.<br>v4: (F) 108 words, est. 50–61 s, at the target's upper edge. |
| Practical value (10) | 5 | 6 | v3: (J) The general ankle line is informative, not actionable.<br>v4: (J) Walking pain-free is named as only the start. Still light. |
| Accuracy (10) | 9 | 9 ⚠ not improved | v3: (F) Accounts not presented as fact; substitution reason stated as unknown.<br>v4: (F) «حوالي أسبوع» is an approximation (injury before 4 Feb, final 10 Feb), noted. |

**Pass 1:** Payoff-first cold open; three accounts moved to a card; still 112 words (est. 52–63 s).

**Main change / remaining weakness:** Below the bar (79). Story length is the constraint: adding more viewer value means cutting story detail, which is an editorial call for Hazem.

### GEDO · جدو: هدّاف من على الدكة → جدو: هدّاف من على الدكة

**Score:** v3 68 → pass 1 75 → **final 78** · words 89 → 97 · est. من 41 لـ 50 ث → من 45 لـ 55 ث (estimate)

**Diagnosis (v3)**

- **Weak:** «ده مش تفسير لجوانه. ده وصف للدور» argues with no one; «والكاف بعدها سمّته» is not supported by the cited source; no viewer takeaway.
- **Preserve:** the hook, verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش. | **الهوك** هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش. |
| جدو. ست ماتشات، كلها داخل من على الدكة. وخمس جوان. | جدو. ست ماتشات، كلها داخل من على الدكة. وخمس جوان. |
| **هوك النص** والخامس كان في النهائي قدام غانا. الجول الوحيد في الماتش، واللي جاب التالتة على التوالي. | **هوك النص** والخامس في النهائي قدام غانا، دقيقة 85. الجول اللي جاب التالتة على التوالي. |
| والبديل شغلانته مختلفة: بيدخل على ماتش بقاله أكتر من ساعة شغال، ورجله لسه فريش. واللي بيدخل في آخر الماتش عادةً بيقدر يجري بسرعة عالية أكتر من اللي بقالهم ساعة في الملعب. | البديل بيدخل والماتش في أتقل حتة: الكل بقاله أكتر من ساعة بيجري، وهو رجله لسه فريش. |
| ده مش تفسير لجوانه. ده وصف للدور. | وفي بيانات الدوري الإنجليزي، البدلاء بيعملوا جري بسرعة عالية أكتر من اللاعيبة اللي نزلوا مكانهم. الأرقام دي عامة، بس جدو عرف يستغل الدور ده لآخره. |
| **الختام** وجدو استغل الدور ده لآخره: خلّص البطولة هدّاف من غير ما يبدأ ماتش واحد. والكاف بعدها سمّته «السوبر سَب». | **الختام** خلّص البطولة هدّاف، من غير ما يبدأ ماتش واحد. واتعرف بعدها بلقب «السوبر سَب». |
|  | **CTA** ولو انت البديل في الخماسي، فضل سخّن على الخط عشان تدخل جاهز. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 14 | 14 ⚠ not improved | v3: (J) «هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش» is the strongest hook in the PDF. A paradox in 7 words.<br>v4: (J) Kept verbatim. Not improvable by rewriting. |
| Narrative & middle hook (20) | 13 | 14 | v3: (J) Facts, then the role, then «ده مش تفسير لجوانه. ده وصف للدور» argues with no one.<br>v4: (J) +1: the 85' detail sharpens the middle; the EPL data line is now framed without arguing. |
| Egyptian voice (15) | 11 | 13 | v3: (F) 2 contrast reveals in the explanation.<br>v4: (F) 0 contrast reveals. |
| Relevance (10) | 5 | 7 | v3: (J) No link to the viewer's own training.<br>v4: (J) +2: the amateur 5-a-side substitute line. |
| Originality (10) | 8 | 8 ⚠ not improved | v3: (J) The substitute-physiology angle is fresh.<br>v4: (J) Unchanged. |
| Clarity & efficiency (10) | 7 | 7 ⚠ not improved | v3: (F) 41–50 s est.<br>v4: (F) 97 words, est. 45–55 s, around the target's upper edge. Not improved. |
| Practical value (10) | 2 | 6 | v3: (J) No takeaway.<br>v4: (J) +4: «فضل سخّن على الخط» gives one action (principle, not trial-based). |
| Accuracy (10) | 8 | 9 | v3: (F) «والكاف بعدها سمّته» isn't supported by the cited source (Ahram Online documents the nickname, not who gave it).<br>v4: (F) CAF attribution corrected; EPL data from Bradley 2013/2014 described accurately. |

**Pass 1:** Arguing-with-no-one removed, CAF attribution corrected, 85' detail added; no viewer takeaway yet.

**Main change / remaining weakness:** Below the bar (78). It's an optional companion story; length is its limit.

### EP1 · التسخين مالوش لازمة! → التسخين مالوش لازمة!

**Score:** v3 70 → pass 1 78 → **final 79** · words 38 → 44 · est. من 18 لـ 21 ث → من 20 لـ 25 ث (estimate)

**Diagnosis (v3)**

- See recurring weaknesses 5 and 6. **Preserve:** the refrain format and its signature endings, including EP2's brand line verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** التسخين مالوش لازمة! | **الهوك** التسخين مالوش لازمة! |
| مالوش لازمة لو مالوش علاقة باللي هتلعبه. | مالوش لازمة لو وقف عند المشي، وانت داخل تجري بأقصى سرعتك. |
| **هوك النص** والستريتش؟ مالوش لازمة لو طوّلت فيه، ومفيش حركة بعده. | **هوك النص** ومالوش لازمة لو سخّنت، وقعدت نص ساعة مستني تنزل. العضلة بتبرد تاني. |
| ومالوش لازمة لو خلّصته وانت مهدود. | ومالوش لازمة لو خلّصته وانت مهدود. |
| **الختام** التسخين اللي مالوش لازمة هو اللي بيهدّك. اللي ليه لازمة بيجهزك للي جاي. | **الختام** التسخين اللي ليه لازمة بيبدأ هادي، ويعلى لحد ما يشبه اللي هتعمله. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 11 ⚠ not improved | v3: (J) The series refrain from a rehab coach is a strong thumb-stop and is qualified within 2 s.<br>v4: (J) Unchanged. Series format. |
| Narrative & middle hook (20) | 11 | 14 | v3: (J) Three parallel conditions; the first («لو مالوش علاقة باللي هتلعبه») is vague, and the stretch line duplicates EP3.<br>v4: (J) +3: concrete conditions plus a one-line mechanism («العضلة بتبرد تاني»), but still a list, so medium band. |
| Egyptian voice (15) | 12 | 13 | v3: (J) Natural.<br>v4: (J) +1. |
| Relevance (10) | 7 | 8 | v3: (J) General gym audience.<br>v4: (J) +1: the sprint and bench-waiting situations are recognisable. |
| Originality (10) | 7 | 8 | v3: (J) The series format is distinctive; this episode's content is generic.<br>v4: (J) +1: the 'waited too long' condition is uncommon. |
| Clarity & efficiency (10) | 9 | 9 ⚠ not improved | v3: (F) 18–21 s.<br>v4: (F) Unchanged, 20–25 s. |
| Practical value (10) | 6 | 8 | v3: (J) The fatigue condition is actionable; the others are vague.<br>v4: (J) +2: «بيبدأ هادي، ويعلى لحد ما يشبه اللي هتعمله» is a usable rule. |
| Accuracy (10) | 7 | 8 | v3: (J) 'Useless' is an exaggeration device; the stretch line repeats EP3's science.<br>v4: (J) +1: conditions supported by McGowan 2015 and Bishop 2003; 'useless' is still the series' exaggeration. |

**Pass 1:** Concrete conditions (walking only before a sprint, waiting 30 min); stretch line removed to avoid duplicating EP3.

**Main change / remaining weakness:** Below the bar (79) because the ≤25 s list format caps the narrative score. Changing the series format needs Hazem's approval.

### EP2 · تمرين التأهيل مالوش لازمة! → تمرين التأهيل مالوش لازمة!

**Score:** v3 74 → pass 1 77 → **final 82** · words 36 → 43 · est. من 17 لـ 20 ث → من 20 لـ 24 ث (estimate)

**Diagnosis (v3)**

- See recurring weaknesses 5 and 6. **Preserve:** the refrain format and its signature endings, including EP2's brand line verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** تمرين التأهيل مالوش لازمة! | **الهوك** تمرين التأهيل مالوش لازمة! |
| مالوش لازمة لو بقالك شهور بنفس الوزن. | مالوش لازمة لو بقالك 3 شهور بنفس الباند الأحمر. |
| **هوك النص** وحتى لو الوجع راح؟ مالوش لازمة لو ده مقياسك الوحيد. | **هوك النص** في تجربة على وتر الركبة، الوزن كان بيتقل: من 15 عدة، لـ 6. |
| ومالوش لازمة لو مالوش علاقة برياضتك. | ومالوش لازمة لو مقياسك الوحيد إن الوجع راح. |
| **الختام** التمرين اللي مابيتقلش ومابيتقاسش… هو ده اللي مالوش لازمة. | **الختام** التمرين اللي مابيتقلش ومابيتقاسش… هو ده اللي مالوش لازمة. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 11 ⚠ not improved | v3: (J) Provocative for a rehab account; brand-adjacent.<br>v4: (J) Unchanged. Series format. |
| Narrative & middle hook (20) | 11 | 15 | v3: (J) Conditions without proof; «لو مالوش علاقة برياضتك» repeats EP1's «مالوش علاقة» construction.<br>v4: (J) +4: condition → proof («الوزن كان بيتقل: من 15 عدة، لـ 6») → condition → brand line. |
| Egyptian voice (15) | 13 | 13 ⚠ not improved | v3: (J) Natural and rhythmic.<br>v4: (J) Unchanged. |
| Relevance (10) | 8 | 9 | v3: (J) Anyone stuck in rehab.<br>v4: (J) +1: «3 شهور بنفس الباند الأحمر» is a concrete image. |
| Originality (10) | 8 | 8 ⚠ not improved | v3: (J) The brand line is distinctive.<br>v4: (J) Unchanged. |
| Clarity & efficiency (10) | 9 | 9 ⚠ not improved | v3: (F) 17–20 s.<br>v4: (F) 43 words, est. 20–24 s. |
| Practical value (10) | 6 | 8 | v3: (J) «بنفس الوزن» is useful; the rest is vague.<br>v4: (J) +2. |
| Accuracy (10) | 8 | 9 | v3: (J) Principle-based and labelled as such.<br>v4: (F) +1: the progression was verified in the Kongsgaard 2009 full text (15RM → 6RM over 12 weeks). |

**Pass 1:** Added the red-band image and the Kongsgaard 15→6 progression; 55 words (est. 25–31 s, over 25). Lint FAIL.

**Main change / remaining weakness:** Brand line kept verbatim; proof added.

### EP3 · الستريتشينج قبل التمرين مالوش لازمة! → الستريتشينج قبل التمرين مالوش لازمة!

**Score:** v3 69 → pass 1 74 → **final 80** · words 40 → 44 · est. من 18 لـ 23 ث → من 20 لـ 25 ث (estimate)

**Diagnosis (v3)**

- See recurring weaknesses 5 and 6. **Preserve:** the refrain format and its signature endings, including EP2's brand line verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** الستريتش قبل التمرين مالوش لازمة! | **الهوك** الستريتش قبل التمرين مالوش لازمة! |
| مالوش لازمة لو بتمسك كل عضلة أكتر من دقيقة. | مالوش لازمة لو بتمسك الخلفية دقيقة وأكتر قبل السكوات. ممكن ياخد من قوتك. |
| **هوك النص** وفاكره هيحميك من الإصابات؟ لوحده كده… مالوش لازمة. | **هوك النص** وفاكره بيحميك من الإصابات؟ لوحده، الدليل مش واضح. |
| ومالوش لازمة لو خلّصته ودخلت على التقيل على طول. | **الختام** جوه تسخين فيه حركة، ممكن يقلل إصابات العضل. فخليه أقل من دقيقة، وبعده حركة. كده يبقى ليه لازمة. |
| **الختام** عايزه؟ خليه قصير، وبعده حركة. كده يبقى ليه لازمة. |  |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 11 ⚠ not improved | v3: (J) Series refrain.<br>v4: (J) Unchanged. Series format. |
| Narrative & middle hook (20) | 11 | 15 | v3: (J) Three conditions; the injury line is a bare assertion.<br>v4: (J) +4: condition with cost → injury myth → nuance («جوه تسخين فيه حركة، ممكن يقلل إصابات العضل») → rule. |
| Egyptian voice (15) | 12 | 13 | v3: (J) Natural.<br>v4: (J) +1. |
| Relevance (10) | 7 | 8 | v3: (J) Gym-goers who stretch before lifting.<br>v4: (J) +1: «بتمسك الخلفية دقيقة وأكتر قبل السكوات» is a concrete habit. |
| Originality (10) | 6 | 7 | v3: (J) Common topic.<br>v4: (J) +1: the nuance that it helps *inside* a warm-up is less commonly said. |
| Clarity & efficiency (10) | 9 | 9 ⚠ not improved | v3: (F) 18–23 s.<br>v4: (F) 44 words, est. 20–25 s. |
| Practical value (10) | 7 | 8 | v3: (J) «خليه قصير، وبعده حركة» is actionable.<br>v4: (J) +1: «أقل من دقيقة، وبعده حركة». |
| Accuracy (10) | 6 | 9 | v3: (F) «وفاكره هيحميك من الإصابات؟ لوحده كده… مالوش لازمة» overstates it: Behm 2015 recommends stretching inside a warm-up with dynamic activity to reduce muscle injuries.<br>v4: (F) +3: matches Behm 2015 (≥60 s −4.6% vs <60 s −1.1%; no clear effect on all-cause injuries; recommended within a dynamic warm-up for muscle injuries). |

**Pass 1:** Injury claim corrected into a myth→nuance turn; 52 words (est. 24–29 s). Over 25.

**Main change / remaining weakness:** The main scientific correction in the series.

### EP5 · الكارديو مالوش لازمة! → الكارديو مالوش لازمة!

**Score:** v3 65 → pass 1 74 → **final 80** · words 45 → 40 · est. من 21 لـ 25 ث → من 18 لـ 23 ث (estimate)

**Diagnosis (v3)**

- See recurring weaknesses 5 and 6. **Preserve:** the refrain format and its signature endings, including EP2's brand line verbatim.

| v3 (spoken) | v4 final (spoken) |
|---|---|
| **الهوك** الكارديو مالوش لازمة! | **الهوك** الكارديو مالوش لازمة! |
| مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم. | لو هدفك عضل: في تحليل لـ 21 دراسة، اللي جمعوا حديد وكارديو عضلهم زاد… بس أقل. |
| **هوك النص** والغريبة إن مش أي كارديو زي التاني. مالوش لازمة لو نوعه مش ماشي مع هدفك. | **هوك النص** والجري أثّر، والعجلة لأ. والمدة والأيام بتفرق. |
| ومالوش لازمة لو بتطوّل فيه من غير هدف. | يعني عجلة أكتر، وجري أقصر. |
| **الختام** الكارديو ليه لازمة… بس بالجرعة اللي تخدم هدفك. | **الختام** الكارديو ليه لازمة… بس بالنوع والجرعة اللي تخدم هدفك. |

| Dimension | v3 | final | Justification (v3 → final) |
|---|---|---|---|
| Hook (15) | 11 | 11 ⚠ not improved | v3: (J) Series refrain.<br>v4: (J) Unchanged. Series format. |
| Narrative & middle hook (20) | 10 | 15 | v3: (J) «مالوش لازمة لو نوعه مش ماشي مع هدفك» is vague and adds nothing new.<br>v4: (J) +5: data reveal («عضلهم زاد… بس أقل») → twist («الجري أثّر، والعجلة لأ») → rule. |
| Egyptian voice (15) | 12 | 13 | v3: (J) Natural.<br>v4: (J) +1. |
| Relevance (10) | 8 | 8 ⚠ not improved | v3: (J) Lifters who do cardio.<br>v4: (J) Unchanged. |
| Originality (10) | 6 | 7 | v3: (J) The interference topic is common.<br>v4: (J) +1: the running-vs-cycling detail is less known. |
| Clarity & efficiency (10) | 8 | 9 | v3: (F) 21–25 s.<br>v4: (F) 40 words, est. 18–23 s. |
| Practical value (10) | 5 | 8 | v3: (J) «بالجرعة اللي تخدم هدفك» doesn't say what the dose is.<br>v4: (J) +3: «عجلة أكتر، وجري أقصر» (an applied principle, labelled in NOTES). |
| Accuracy (10) | 5 | 9 | v3: (F) «مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم» contradicts the PDF's own «مش بنقول» note and Wilson 2012 (concurrent hypertrophy ES 0.85 vs 1.23: smaller, not zero).<br>v4: (F) +4: matches Wilson 2012 (21 studies; running, not cycling, significantly reduced gains; duration and frequency inversely related). |

**Pass 1:** Claim corrected and running vs cycling added; the opening «…لو هدفك عضل… ؟» read awkwardly.

**Main change / remaining weakness:** The script that contradicted its own source now matches it.

## Not rewritten (no script text in the PDF)

- **EP4 «برنامج الوقاية مالوش لازمة!»**: v3 states the lines won't be written until a source on programme adherence/dose is chosen. I didn't draft it, because choosing that source is a research decision for you. A candidate to evaluate is the adherence literature on the FIFA 11+ (Soligard 2008 is already cited in v3).
- **A3 «متابعة الرباط الصليبي»**: deferred in your plan. Not drafted.
