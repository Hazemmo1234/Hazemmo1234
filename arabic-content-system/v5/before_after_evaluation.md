# before_after_evaluation.md

**What these numbers are:** one editor (Claude) scored v3 (your PDF), v4 (the previous attempt) and v5 (this rewrite) with the same 10×10 rubric (`content_system/guides/rubric.md`) in one sitting. They're **editorial diagnostics, not predictions of reach, retention or virality.** The "words shared with v3" column is measured, not judged: word-level sequence similarity of the spoken text.

## Summary

| ID | Category | v3 | v4 | v5 | Δ v3→v5 | words shared v3↔v4 | words shared v3↔v5 | estimate v3 → v5 | meets bar |
|---|---|---|---|---|---|---|---|---|---|
| A1 | fitness/rehab | 65 | 74 | **78** | +13 | 27% | 28% | من 35 لـ 43 ث → من 40 لـ 49 ث | yes |
| B1 | fitness/rehab | 62 | 72 | **78** | +16 | 38% | 19% | من 34 لـ 42 ث → من 34 لـ 41 ث | yes |
| A2 | fitness/rehab | 64 | 75 | **78** | +14 | 36% | 41% | من 40 لـ 49 ث → من 39 لـ 48 ث | yes |
| B2 | fitness/rehab | 63 | 76 | **79** | +16 | 25% | 24% | من 47 لـ 57 ث → من 44 لـ 54 ث | yes |
| B3 | fitness/rehab | 67 | 76 | **78** | +11 | 47% | 47% | من 41 لـ 50 ث → من 41 لـ 50 ث | yes |
| EP01 | AFCON | 64 | 69 | **84** | +20 | 82% | 37% | من 57 لـ 69 ث → من 54 لـ 66 ث | yes |
| EP02 | AFCON | 62 | 69 | **82** | +20 | 62% | 21% | من 53 لـ 65 ث → من 50 لـ 61 ث | yes |
| GEDO | AFCON | 65 | 73 | **79** | +14 | 58% | 27% | من 41 لـ 50 ث → من 49 لـ 60 ث | yes |
| EP1 | series «مالوش لازمة» | 62 | 73 | **75** | +13 | 44% | 31% | من 18 لـ 21 ث → من 21 لـ 25 ث | yes |
| EP2 | series «مالوش لازمة» | 66 | 75 | **76** | +10 | 58% | 55% | من 17 لـ 20 ث → من 20 لـ 25 ث | yes |
| EP3 | series «مالوش لازمة» | 62 | 75 | **75** | +13 | 48% | 45% | من 18 لـ 23 ث → من 20 لـ 25 ث | yes |
| EP5 | series «مالوش لازمة» | 58 | 72 | **75** | +17 | 31% | 33% | من 21 لـ 25 ث → من 19 لـ 23 ث | yes |
| **avg** | | 63.3 | 73.2 | **78.1** | +14.7 | | | | 12/12 |

Bar: total ≥75, integrity ≥8, no dimension below 6, lint 0 FAIL, regression PASS.

**Why the previous attempt didn't feel different:** v4's EP01 kept **82%** of v3's spoken words, and EP02 kept 62%. The v4 system protected strong lines, and that rule ended up preserving the weak structure around them. In v5, EP01 shares 37% and EP02 21%. Those stories were rebuilt from the verified facts (`afcon_storytelling_guide.md`).

## Automated checks (reproducible)

| | v3 | v4 | v5 |
|---|---|---|---|
| lint FAIL / WARN | 2 / 11 | 0 / 4 | 0 / 0 |
| «مش X… Y» contrast reveals | 9 | 0 | 0 |
| «X: Y» colons in speech | 15 | 22 | 2 |
| spoken disclaimers | 7 | 0 | 0 |
| generic referral endings | 4 | 0 | 0 |
| v5 regression suite | 1/13 passed | 8/13 passed | 13/13 passed |

Some regression cases encode v5 decisions (for example, the EP02 hook mustn't contain the payoff), so earlier versions failing them isn't independent evidence. The independent signals are length, contrast and colon counts, disclaimers, referral endings, clichés and duplicated conditions.

## Representative before / after passages

### EP01: Opening: ambiguity and a contrast → a paradox plus a held question

> **v3:** أبو تريكة، صاحب جول نهائي 2008، فاته لقب 2010 كله. ومش بسبب حاجة حصلت في أنجولا.
>
> **v5:** مصر كسبت أمم أفريقيا 2010 من غير ولا خسارة، وأبو تريكة ما لعبش ولا دقيقة. والسبب اتعرف بعدها بسبع سنين.

### EP01: Ending: summary → insight

> **v3:** ومصر كسبت التالتة على التوالي من غيره. وأوقات أصعب قرار في الرجوع من إصابة… إنك تقول: لسه.
>
> **v5:** أبو تريكة اتعرف بالجوان الكبيرة. بس في 2010، أهم حاجة عملها كانت كلمة واحدة: لسه.

### EP02: Opening: whole setup → a debt the story repays

> **v3:** زيدان فوّت لقب 2006 عشان ناديه. في 2008 اختار المنتخب عشان يعيش إحساس البطل… وقبل ربع النهائي، كاحله وقّف كل حاجة.
>
> **v5:** سنة 2006، مصر كسبت أمم أفريقيا في القاهرة، وزيدان ماكانش في الفرقة. كان اختار ناديه.

### EP02: Middle: accounts and minutes → a setback, then the rematch

> **v3:** ماتش أنجولا اتلعب من غيره. طب اتعور إزاي؟ تلات روايات: في التسخين، ولا حفرة في التمرين، ولا التحام مع أحمد فتحي، زي ما قال هو بعد 16 سنة. مانعرفش ليه نزل بديل. بس الكاحل كده بيرجع للكورة: المشي بيرجع بدري، لكن الماتش عايز جري وفرملة ولف والتحامات.
>
> **v5:** بعدها بسنتين في غانا، قال إنه جاي يعيش إحساس البطل. وأول ماتش، قدام الكاميرون، جاب جولين. قبل نص النهائي قال لسه مش عارف إذا كان جاهز، ونزل بديل. والنهائي قدام الكاميرون تاني، وزيدان على الدكة لحد قرب الساعة. قبل النهاية بربع ساعة تقريبًا، سونج، كابتن الكاميرون، الكورة معاه على حدود منطقته. زيدان يدخل عليه، ياخدها، ويحطها لأبو تريكة. جول، وبطولة.

### GEDO: Body: stat fragments and arguing with no one → who he was, then escalation

> **v3:** جدو. ست ماتشات، كلها داخل من على الدكة. وخمس جوان. والبديل شغلانته مختلفة: بيدخل على ماتش بقاله أكتر من ساعة شغال، ورجله لسه فريش. واللي بيدخل في آخر الماتش عادةً بيقدر يجري بسرعة عالية أكتر من اللي بقالهم ساعة في الملعب. ده مش تفسير لجوانه. ده وصف للدور.
>
> **v5:** محمد ناجي جدو. كان بيلعب في الاتحاد السكندري، وأول ماتش دولي ليه كان قبل البطولة بأسبوعين. نزل بديل في الست ماتشات، ولعب في البطولة كلها أقل من ماتشين. البديل بيدخل والباقيين بقالهم ساعة بيجروا. وفي بيانات الدوري الإنجليزي، البدلاء بيعملوا جري سريع أكتر من اللي نزلوا مكانهم. الأرقام دي عامة، بس جدو استغل الميزة دي لآخرها.

### B1: Educational: vague gap and a categories list → a lived scene and a decision rule

> **v3:** الوجع راح، رجعت تلعب، واتصبت تاني؟ يمكن كنت بتقيس بالحاجة الغلط. فإن الوجع راح، ده لوحده مش معناه إنك جاهز. الجاهزية بتتقاس: قوة، ونط، ونَفَس، قدام اللي رياضتك هتطلبه منك.
>
> **v5:** أسبوعين من غير وجع، رجعت الملعب، وفي أول سبرنت اتصبت تاني. فقبل ما ترجع، قارن رجلك المصابة بالسليمة في القوة، والنط عليها لوحدها، وتغيير الاتجاه من غير تردد. لو الفرق واضح، انت لسه في النص.

### EP5: Series: claim contradicting its source → correct claim plus a twist

> **v3:** مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم. والغريبة إن مش أي كارديو زي التاني. مالوش لازمة لو نوعه مش ماشي مع هدفك. ومالوش لازمة لو بتطوّل فيه من غير هدف.
>
> **v5:** لو هدفك عضل؟ تحليل لـ 21 دراسة لقى إن اللي جمعوا حديد وكارديو عضلهم زاد، بس أقل. والجري أثّر، والعجلة لأ. والمدة والأيام بتفرق. يعني عجلة أكتر، وجري أقصر.

## Per-script scores and justifications

### A1 · الشد الخلفي بييجي في لحظة محددة  (v3 65 → v4 74 → v5 78)

v4 note: Contrast tic fixed; v4 hook was a moment statement, weaker as a scene

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 7 | 7 | 8 | v3: (J) «أكبر حمل… مش وانت بتستريتش» specific but opens on a contrast<br>v5: (J) «بتجري على كورة طويلة، وفجأة إيدك على ورا رجلك» is a scene every footballer has lived |
| Coherence | 7 | 8 | 8 | v3: (J) follows, but the Nordic number arrives with no bridge<br>v5: (J) scene → when → mechanism → number → myth → proof → question |
| Progression | 6 | 8 | 8 | v3: (J) mechanism → stat → referral; nothing escalates<br>v5: (J) each beat new; the 40% escalates the mechanism |
| Middle hook | 5 | 7 | 7 | v3: (J) «العضلة بتطول وهي شغالة» restates; not a turn<br>v5: (J) the 40% figure is a real escalation |
| Egyptian Arabic | 6 | 8 | 8 | v3: (F) 3 contrast reveals in 77 words<br>v5: (F) 0 contrasts over cap, 1 colon |
| Originality | 7 | 7 | 7 ⚠ not improved | v3: (J) the lengthening-under-load angle is above typical<br>v5: (J) unchanged angle |
| Concision & pacing | 7 | 7 | 8 | v3: (F) est. 35–43 s<br>v5: (F) 87 words, est. 40–49 s (target 35–45) |
| Payoff & value | 4 | 6 | 7 | v3: (F) ends «اتقيّم»<br>v5: (J) the audit question is actionable; no Nordic how-to |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) matches Sun 2015 / van Dyk 2019<br>v5: (F) unchanged; «أول سؤال» plus on-screen multifactor note |
| Spoken delivery | 7 | 7 | 8 | v3: (J) the fragments «وانت بتجري. وفي لحظتين بالذات.» read written<br>v5: (J) flows aloud |

### B1 · الوجع راح… والرجل لسه مارجعتش  (v3 62 → v4 72 → v5 78)

v4 note: v4 had 4 «X: Y» colons

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 6 | 7 | 8 | v3: (J) «يمكن كنت بتقيس بالحاجة الغلط» is vague<br>v5: (J) «أسبوعين من غير وجع، رجعت الملعب، وفي أول سبرنت اتصبت تاني» is the viewer's story in one breath |
| Coherence | 7 | 8 | 8 | v3: (J) model is clear<br>v5: (J) scene → what pain was telling you → model → test |
| Progression | 6 | 7 | 7 | v3: (J) model → mid → abstract list<br>v5: (J) good, but the middle is one line |
| Middle hook | 7 | 7 | 6 ⚠ not improved | v3: (J) «الوجع ممكن يروح وانت لسه هنا» is a genuine turn<br>v5: (J) the mid line is shorter than v3's; the reveal now sits in LINE 1 |
| Egyptian Arabic | 5 | 7 | 8 | v3: (F) MSA «فإن», 2 contrasts<br>v5: (F) no MSA, no colon tics |
| Originality | 6 | 6 | 7 | v3: (J) known concept<br>v5: (J) «الوجع كان بيقولك… ماكانش بيقولك…» reframes |
| Concision & pacing | 5 | 8 | 9 | v3: (F) 2 spoken disclaimers<br>v5: (F) 73 words, est. 34–41 s |
| Payoff & value | 5 | 6 | 8 | v3: (J) «قوة، ونط، ونَفَس» categories, not tests<br>v5: (J) a concrete compare-three-things test plus a decision rule |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) no numbers; label on screen<br>v5: (F) no overclaim; no threshold invented |
| Spoken delivery | 6 | 7 | 8 | v3: (J) disclaimers break the flow<br>v5: (J) flows |

### A2 · الالتواء التاني  (v3 64 → v4 75 → v5 78)

v4 note: Number hook; v5 moves to a scene

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 5 | 8 | 8 | v3: (J) «كاحلك بطّل يوجعك؟ حلو. بس…» is a common take<br>v5: (J) «لويت كاحلك، ريّحته، وخف. وبعد كام شهر، اتلوى تاني» is a lived sequence |
| Coherence | 7 | 8 | 8 | v3: (J) clear<br>v5: (J) clear |
| Progression | 7 | 7 | 8 | v3: (J) number → number → demo<br>v5: (J) scene → how common → what changed it → try it → reframe |
| Middle hook | 7 | 7 | 7 ⚠ not improved | v3: (J) the 22% comparison works<br>v5: (J) the 22% comparison |
| Egyptian Arabic | 6 | 8 | 8 | v3: (F) 2 contrasts plus a spoken disclaimer<br>v5: (F) clean |
| Originality | 5 | 6 | 6 | v3: (J) common topic<br>v5: (J) unchanged topic |
| Concision & pacing | 6 | 8 | 8 | v3: (F) est. 40–49 s with a disclaimer line<br>v5: (F) 85 words, est. 39–48 s |
| Payoff & value | 5 | 7 | 8 | v3: (F) «كلّم مختص»<br>v5: (J) demo plus the «بيسندني» reframe |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) numbers match Hupperets<br>v5: (F) absolute numbers; n on screen |
| Spoken delivery | 7 | 7 | 8 | v3: (J) disclaimer line awkward<br>v5: (J) flows |

### B2 · وتر بيوجع: الرأي التالت  (v3 63 → v4 76 → v5 79)

v4 note: v4 content kept, colon tic removed

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 5 | 7 | 8 | v3: (J) two questions plus a vague tease<br>v5: (J) «واحد يقولك ريّح خالص، وواحد يقولك خد حقنة» puts the advice people actually hear in their mouths |
| Coherence | 7 | 8 | 8 | v3: (J) ok<br>v5: (J) clear |
| Progression | 6 | 8 | 8 | v3: (J) trials then caveat<br>v5: (J) advice → trial 1 → trial 2 (stakes) → rule |
| Middle hook | 6 | 8 | 8 | v3: (J) the Achilles result<br>v5: (J) «وبعد 6 شهور التحسن رجع لورا» |
| Egyptian Arabic | 7 | 7 | 8 | v3: (J) some written register<br>v5: (F) no colon tics (v4 had 4) |
| Originality | 7 | 7 | 7 ⚠ not improved | v3: (J) the injection vs HSR comparison is distinctive<br>v5: (J) unchanged |
| Concision & pacing | 5 | 7 | 7 | v3: (F) 47–57 s, longest<br>v5: (F) 96 words, est. 44–54 s |
| Payoff & value | 5 | 8 | 8 | v3: (J) «يتظبط على قد حالتك» abstract + «اتقيّم»<br>v5: (J) next-morning rule |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) correct<br>v5: (F) trials separate, n on cards |
| Spoken delivery | 6 | 7 | 8 | v3: (J) dense<br>v5: (J) flows |

### B3 · اختبار الحيطة: الرقم اللي يستاهل تعيده  (v3 67 → v4 76 → v5 78)

v4 note: Same content as v5 except CTA moved to the caption

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 8 | 8 | 8 ⚠ not improved | v3: (J) strong do-it-now<br>v5: (J) same hook (kept: still the best) |
| Coherence | 7 | 8 | 8 | v3: (J) clear instructions<br>v5: (J) clear |
| Progression | 6 | 7 | 7 | v3: (J) instructions → vague caveat → referral<br>v5: (J) instructions → error → limits → re-test |
| Middle hook | 5 | 8 | 8 | v3: (J) «هامش خطأ» vague<br>v5: (J) «ممكن يختلف لحد 2 سنتي» concrete |
| Egyptian Arabic | 7 | 7 | 8 | v3: (J) natural<br>v5: (F) clean |
| Originality | 6 | 7 | 7 | v3: (J) known test<br>v5: (J) re-test framing uncommon |
| Concision & pacing | 7 | 7 | 7 ⚠ not improved | v3: (F) est. 41–50 s<br>v5: (F) 89 words, est. 41–50 s |
| Payoff & value | 4 | 8 | 8 | v3: (F) no use for the number; «وريه لمختص»<br>v5: (J) measure → train → re-test with a threshold |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) correct<br>v5: (F) MDC approximation flagged |
| Spoken delivery | 8 | 7 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) flows |

### EP01 · أبو تريكة: البطولة اللي كسبها بكلمة «لسه»  (v3 64 → v4 69 → v5 84)

v4 note: v4 was 82% identical to v3: hook and compression only

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 6 | 7 | 9 | v3: (J) «فاته لقب 2010 كله» is ambiguous: Egypt won it<br>v5: (J) «مصر كسبت… من غير ولا خسارة، وأبو تريكة ما لعبش ولا دقيقة. والسبب اتعرف بعدها بسبع سنين» poses a real question |
| Coherence | 7 | 7 | 9 | v3: (J) follows<br>v5: (J) stakes (Omdurman) → injury → dilemma (40 days) → reveal → why → consequence → insight |
| Progression | 5 | 5 | 9 | v3: (J) «21 نوفمبر 2009… آخر ديسمبر… 10 يناير» is a timeline, no stakes<br>v5: (J) every beat raises the stakes or answers the question |
| Middle hook | 7 | 7 | 9 | v3: (J) the Shehata/Aboutrika turn is real<br>v5: (J) the reveal is held to the middle and paid plainly |
| Egyptian Arabic | 7 | 7 | 8 | v3: (J) natural<br>v5: (J) natural; one colon, at the payoff |
| Originality | 7 | 7 | 8 | v3: (J) good subject<br>v5: (J) the Omdurman → 4–0 arc wasn't in v3 |
| Concision & pacing | 4 | 7 | 7 | v3: (F) est. 57–69 s vs its own 45–55 s target<br>v5: (F) 117 words, est. 54–66 s (target 50–60) |
| Payoff & value | 6 | 6 | 8 | v3: (J) the «لسه» ending is good but generic-ish<br>v5: (J) «اتعرف بالجوان الكبيرة… أهم حاجة عملها كانت كلمة واحدة: لسه» |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) careful sourcing<br>v5: (F) Omdurman, 6/6 and 4–0 verified; 40-day arithmetic in NOTES |
| Spoken delivery | 6 | 7 | 8 | v3: (J) date-heavy lines are hard to follow by ear<br>v5: (J) chronology clear by ear |

### EP02 · زيدان: البطولة اللي فاتته… والتانية اللي خلّصها بالتحام  (v3 62 → v4 69 → v5 82)

v4 note: v4 = payoff-first cold open with 5 colon reveals

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 5 | 8 | 8 | v3: (J) three sentences give the whole setup; nothing is held<br>v5: (J) «سنة 2006، مصر كسبت… وزيدان ماكانش في الفرقة. كان اختار ناديه» opens a debt the story repays |
| Coherence | 6 | 7 | 9 | v3: (J) jumps between accounts<br>v5: (J) chronological and clear |
| Progression | 5 | 6 | 9 | v3: (J) list of accounts and minutes<br>v5: (J) missed title → two goals v Cameroon → injury → bench → Cameroon again → the duel |
| Middle hook | 7 | 7 | 8 | v3: (J) «لسه مش عارف» is good<br>v5: (J) the setback beat plus the rematch reveal («قدام الكاميرون تاني») |
| Egyptian Arabic | 7 | 6 | 8 | v3: (J) natural<br>v5: (F) 0 colons (v4 had 5) |
| Originality | 7 | 7 | 8 | v3: (J) the duel angle is strong<br>v5: (J) the bookend wasn't in v3 or v4 |
| Concision & pacing | 5 | 6 | 7 | v3: (F) est. 53–65 s<br>v5: (F) 109 words, est. 50–61 s |
| Payoff & value | 5 | 6 | 8 | v3: (J) the ending connects to the ankle<br>v5: (J) the insight ties the duel to the ankle |
| Integrity | 9 | 9 | 9 ⚠ not improved | v3: (F) honest about the unknowns<br>v5: (F) opener 4–2 with Zidan 17'/45' verified; minute discrepancy handled |
| Spoken delivery | 6 | 7 | 8 | v3: (J) reading the 3 accounts aloud is heavy<br>v5: (J) present-tense action works |

### GEDO · جدو: هدّاف من على الدكة  (v3 65 → v4 73 → v5 79)

v4 note: v4 added the CTA but kept v3's fact list

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 9 | 9 | 9 ⚠ not improved | v3: (J) best hook in the PDF<br>v5: (J) kept verbatim; still the best |
| Coherence | 7 | 7 | 8 | v3: (J) ok<br>v5: (J) clear |
| Progression | 5 | 6 | 8 | v3: (J) facts then the role<br>v5: (J) unknown (2-week debut) → always on the bench → goals get heavier → why subs can |
| Middle hook | 6 | 7 | 8 | v3: (J) the final goal<br>v5: (J) the escalation QF → SF → final is real |
| Egyptian Arabic | 6 | 8 | 8 | v3: (F) «ده مش… ده…» arguing with no one<br>v5: (F) clean |
| Originality | 7 | 7 | 8 | v3: (J) the sub angle is fresh<br>v5: (J) the debut and minutes facts are new |
| Concision & pacing | 7 | 7 | 7 ⚠ not improved | v3: (F) est. 41–50 s<br>v5: (F) 107 words, est. 49–60 s |
| Payoff & value | 3 | 5 | 6 | v3: (J) no takeaway<br>v5: (J) the 5-a-side re-warm-up line is one action |
| Integrity | 7 | 9 | 9 | v3: (F) «والكاف بعدها سمّته» unsupported<br>v5: (F) debut, minutes and goals verified; discrepancies ranged |
| Spoken delivery | 8 | 8 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) flows |

### EP1 · التسخين مالوش لازمة!  (v3 62 → v4 73 → v5 75)

v4 note: v5 second pass: conditions reordered, new ending that resolves all three

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 7 | 7 | 7 ⚠ not improved | v3: (J) series refrain<br>v5: (J) series refrain |
| Coherence | 6 | 7 | 7 | v3: (J) ok<br>v5: (J) ok |
| Progression | 5 | 6 | 7 | v3: (J) parallel list<br>v5: (J) conditions now follow the warm-up in time (during → end → after); still a list (format) |
| Middle hook | 5 | 7 | 7 | v3: (J) none real<br>v5: (J) «قعدت على الدكة نص ساعة. العضلة بتبرد تاني» is the surprising one, placed last |
| Egyptian Arabic | 7 | 8 | 8 | v3: (J) natural<br>v5: (J) natural |
| Originality | 5 | 7 | 7 | v3: (J) generic conditions<br>v5: (J) the bench condition links to GEDO |
| Concision & pacing | 8 | 8 | 8 ⚠ not improved | v3: (F) 18–21 s<br>v5: (F) est. 20–25 s |
| Payoff & value | 5 | 7 | 8 | v3: (J) vague condition<br>v5: (J) the 3-part rule answers each condition |
| Integrity | 6 | 8 | 8 | v3: (J) the stretch line duplicates EP3<br>v5: (J) conditions match McGowan / Bishop; 'useless' is the series exaggeration |
| Spoken delivery | 8 | 8 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) good |

### EP2 · تمرين التأهيل مالوش لازمة!  (v3 66 → v4 75 → v5 76)

v4 note: v5 rewords the proof line only

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 7 | 7 | 7 ⚠ not improved | v3: (J) refrain<br>v5: (J) refrain |
| Coherence | 6 | 8 | 8 | v3: (J) ok<br>v5: (J) ok |
| Progression | 5 | 7 | 7 | v3: (J) conditions without proof<br>v5: (J) condition → proof → condition → brand line |
| Middle hook | 5 | 7 | 7 | v3: (J) none<br>v5: (J) the 15 → 6 proof |
| Egyptian Arabic | 8 | 8 | 8 ⚠ not improved | v3: (J) natural<br>v5: (J) natural |
| Originality | 7 | 7 | 7 ⚠ not improved | v3: (J) brand line<br>v5: (J) unchanged |
| Concision & pacing | 8 | 8 | 8 ⚠ not improved | v3: (F) 17–20 s<br>v5: (F) est. 20–25 s |
| Payoff & value | 5 | 7 | 7 | v3: (J) vague third condition<br>v5: (J) concrete |
| Integrity | 7 | 9 | 9 | v3: (J) principle<br>v5: (F) Kongsgaard protocol verified |
| Spoken delivery | 8 | 7 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) the proof is now spoken without a colon |

### EP3 · الستريتشينج قبل التمرين مالوش لازمة!  (v3 62 → v4 75 → v5 75)

v4 note: v5 rewords the ending only

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 7 | 7 | 7 ⚠ not improved | v3: (J) refrain<br>v5: (J) refrain |
| Coherence | 6 | 8 | 8 | v3: (J) ok<br>v5: (J) ok |
| Progression | 5 | 7 | 7 | v3: (J) conditions<br>v5: (J) condition → myth → nuance → rule |
| Middle hook | 5 | 7 | 7 | v3: (J) none<br>v5: (J) the nuance turn |
| Egyptian Arabic | 7 | 8 | 8 | v3: (J) natural<br>v5: (J) natural |
| Originality | 5 | 6 | 6 | v3: (J) common<br>v5: (J) unchanged |
| Concision & pacing | 8 | 8 | 8 ⚠ not improved | v3: (F) 18–23 s<br>v5: (F) est. 21–25 s |
| Payoff & value | 6 | 7 | 7 | v3: (J) «خليه قصير، وبعده حركة»<br>v5: (J) <60 s plus movement |
| Integrity | 5 | 9 | 9 | v3: (F) the injury line overstates Behm 2015<br>v5: (F) matches Behm |
| Spoken delivery | 8 | 8 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) good |

### EP5 · الكارديو مالوش لازمة!  (v3 58 → v4 72 → v5 75)

v4 note: v4's «لو هدفك عضل:» colon removed

| Dimension | v3 | v4 | v5 | Why (v3 → v5) |
|---|---|---|---|---|
| Opening | 7 | 7 | 7 ⚠ not improved | v3: (J) refrain<br>v5: (J) refrain |
| Coherence | 5 | 7 | 8 | v3: (J) vague<br>v5: (J) clear |
| Progression | 5 | 7 | 7 | v3: (J) vague conditions<br>v5: (J) data → twist → rule |
| Middle hook | 5 | 7 | 7 | v3: (J) none<br>v5: (J) «الجري أثّر، والعجلة لأ» |
| Egyptian Arabic | 7 | 7 | 8 | v3: (J) natural<br>v5: (F) colon tic removed |
| Originality | 5 | 6 | 6 | v3: (J) common<br>v5: (J) unchanged |
| Concision & pacing | 8 | 8 | 8 ⚠ not improved | v3: (F) 21–25 s<br>v5: (F) est. 19–23 s |
| Payoff & value | 4 | 7 | 7 | v3: (J) no dose given<br>v5: (J) «عجلة أكتر، وجري أقصر» |
| Integrity | 4 | 9 | 9 | v3: (F) contradicts its own note and Wilson 2012<br>v5: (F) matches Wilson |
| Spoken delivery | 8 | 7 | 8 ⚠ not improved | v3: (J) good<br>v5: (J) good |
