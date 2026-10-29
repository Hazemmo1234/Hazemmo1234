# Egyptian Arabic style guide (spoken scripts)

**Basis and limit:** built from Hazem's written preferences and the strongest lines in the
Round 1 PDF. There are **no recordings** of Hazem (the PDF says so), so this guide isn't yet
calibrated to his real voice. Add 2–3 transcripts of him speaking unscripted to a brief
(«عينات صوت»), and update §6.

## 1. The voice

A coach who's seen this a hundred times, telling one person one interesting thing. Confident
enough not to oversell. For stories: a good Egyptian storyteller at a café table who knows
football, not a TV commentator.

## 2. Sentence rules

- **One breath per sentence.** If you need a second breath, split it.
- **Vary length.** A 3-word line lands only next to 12-word lines. Never three fragments in a row (lint: `fragment_drumbeat`).
- **Concrete before abstract.** «بتجري على كورة طويلة، وفجأة إيدك على ورا رجلك» comes before "hamstring strain".
- **The viewer is «انت».** «لويت كاحلك، ريّحته، وخف» is better than «لاعبين كتير بيلووا كاحلهم».
- **Present tense for the decisive action in a story** («زيدان يدخل عليه، ياخدها»), past tense for the context.
- **Numbers the way people say them:** «واحد من كل تلاتة»، «حوالي النص»، «أقل من ماتشين». Precise figures go on screen.

## 3. Connectors and register

| Use | Avoid (written/MSA) |
|---|---|
| عشان كده، يعني، بس، طب، وبعدين، إنما | لذلك، بالتالي، حيث، إذ، فإن |
| ده، دي، دول | هذا، هذه، ذلك |
| هـ (هتعرف) | سوف |
| مابيقيسش، مش هيقولك | لا يقيس، ليس |
| لازم / محتاج | يجب، عليك أن |

## 4. Patterns capped or banned (machine-checked in `content_system/lint_patterns.json`)

| Pattern | Rule | Why |
|---|---|---|
| «مش X… Y» contrast reveal | ≤1 per script, only for the central myth | v3 had 9. It's the strongest AI tell |
| «X: Y» colon reveal | ≤2 per script | v4 had up to 5 per script. It's a tic I introduced, now caught |
| Ellipsis «…» | ≤2 | one pause is emphasis, many are melodrama |
| Spoken disclaimer | ≤1 short clause | caveats go on screen |
| Rhetorical questions | ≤2 short / ≤3 long | |
| Stock and sports clichés | banned | «خليني أقولك»، «دخل التاريخ»، «لحظة لا تُنسى»، «محدش كان يتوقع»… |
| "See a professional" ending | ≤1 per batch, with a named red flag | v3 had it in 4 of 5 approved reels |

## 5. English terms

Use the word the gym uses, written in Arabic: الهامسترينج، النوردك، الستريتش، الكارديو، سكوات،
سبرنت، باند. One technical term per script is plenty. For football: names as Egyptians say
them (أبو تريكة، زيدان، جدو، سونج، شحاتة), and «جول» not «هدف» when speaking.

## 6. Voice fingerprint (protect these unless inaccurate)

- «العضمة مالهاش دعوة الماتش قد إيه مهم.»
- «التمرين اللي مابيتقلش ومابيتقاسش… هو ده اللي مالوش لازمة.»
- «هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش.»
- «اقف قدام حيطة، وفي 30 ثانية هتعرف كاحلك بيتني لقدام قد إيه.»

Protecting a line means keeping it when it's still the best option. It doesn't mean keeping
a weak structure around it. That was v4's mistake on EP01, which stayed 82% identical to the original.

## 7. Explaining science in Egyptian (v6)

- **An image first, then the term once:** «الكتف عامل زي كورة جولف على قاعدة صغيرة» comes before «التجويف». «وسادتين على شكل هلال» comes before «الغضروف الهلالي».
- **The function in a verb:** «بيمنع الساق تتزحلق لقدام»، «بيوزعوا الحمل»، «بيفرمل الرجل».
- **One number per beat, in spoken form:** «4 من كل 10»، «تلت الحالات»، «للنص تقريبًا». The study name and n go on screen.
- **Hedges sized to the evidence:** «غالبًا»، «ممكن»، «في الغالب». Never «أكيد» for physiology.
- **The player vs the science:** «أنشيلوتي قال…» (documented) vs «الغضروف الهلالي…» (general). Don't merge them in one sentence.

## 8. Before → after (Round 1)

| v3 | Problem | v5 |
|---|---|---|
| «أبو تريكة، صاحب جول نهائي 2008، فاته لقب 2010 كله. ومش بسبب حاجة حصلت في أنجولا.» | ambiguous («فاته» when Egypt won), opens on a contrast | «مصر كسبت أمم أفريقيا 2010 من غير ولا خسارة، وأبو تريكة ما لعبش ولا دقيقة. والسبب اتعرف بعدها بسبع سنين.» |
| «زيدان فوّت لقب 2006 عشان ناديه. في 2008 اختار المنتخب عشان يعيش إحساس البطل… وقبل ربع النهائي، كاحله وقّف كل حاجة.» | the whole setup in the hook, nothing held back | «سنة 2006، مصر كسبت أمم أفريقيا في القاهرة، وزيدان ماكانش في الفرقة. كان اختار ناديه.» (the rest unfolds) |
| «فإن الوجع راح، ده لوحده مش معناه إنك جاهز.» | MSA «فإن» plus a contrast | «الوجع كان بيقولك إن الإصابة هديت. ماكانش بيقولك إن رجلك بقت تستحمل الماتش.» |
| «أكبر حمل بيشيله الهامسترينج مش وانت بتستريتش. وانت بتجري.» | a contrast reveal as the hook | «بتجري على كورة طويلة، وفجأة إيدك على ورا رجلك.» |
