# Banned and capped patterns (spoken Egyptian Arabic)

Adapted from three inspected sources (see `research/RESEARCH_AUDIT.md`): the "ban vs cap"
model in coreyhaines31/marketingskills `copywriting/references/ai-tells.md`, the
negation-then-reveal ban in imMamdouhaboammar/copycorn-content-writer, and the
staging/rhythm tells in blader/humanizer. Arabic examples come from Round 1 v3.

The machine-checkable subset lives in `system/lint_patterns.json`.

## Caps (fine once on purpose, a tell when reflexive)

| Pattern | Cap | Why | v3 example → fix |
|---|---|---|---|
| **Contrast reveal** «مش X… Y» / «X، مش Y» / «مش X وخلاص» | 1 per script, and only for the script's central myth | Myth-correction legitimately needs one contrast. Three in 40 seconds turns into a rhythm tic and every sentence starts arguing with someone who didn't speak. | A1 had 3: «مش وانت بتستريتش. وانت بتجري» + «مش ستريتش وخلاص» + «البرنامج كله، مش النوردك لوحده» → keep the stretching contrast only, state the rest directly. |
| **Spoken disclaimer** («ده للتوضيح»، «مش تشخيص»، «مجرد ملاحظة») | 1 short clause per script | Honesty is non-negotiable, but disclaimers mid-flow stop momentum. Most belong on screen. | B1 «الرسم ده للتوضيح، مش أرقام» → on-screen label «رسم توضيحي — مش بيانات» (already planned) and cut the spoken line. |
| **Rhetorical questions** | 2 in ≤30 s, 3 in longer | Questions in the viewer's own voice work. Stacked questions read as a template. | B2 «تريّحه خالص؟ ولا تكمّل عادي؟» is fine once. |
| **Lists of three** | 1 per script | Reflexive triads sound generated. Use the number of items the facts support. | B1 «قوة، ونط، ونَفَس» is OK as the single list. |
| **Ellipsis pause «…»** | 2 per script | A pause marker for delivery. More than two is melodrama. | |
| **Refrain** («مالوش لازمة») | series device only | Repetition is the format of that series, so it's allowed there, but every repetition must add a new, specific condition. | |

## Bans (rewrite on one sighting)

- **Self-answered label questions:** «النتيجة؟»، «السبب؟»، «الحل؟». Delete the question and say the answer.
- **Stock openers/closers:** «خليني أقولك حاجة»، «الحقيقة اللي محدش بيقولها»، «السر اللي…»، «ركز معايا»، «هتنصدم»، «تابعني للمزيد»، «في عالم…». They could open any video on any topic.
- **Em dash in spoken text.** It can't be spoken; use a full stop or a comma.
- **MSA connectors in spoken lines:** الذي/التي، سوف، لذلك، حيث، هذا/هذه، ليس، يجب، «فإن». (B1's ending had «فإن الوجع راح».)
- **Arguing with no one:** a sentence that denies a claim nobody made. Gedo v3: «ده مش تفسير لجوانه. ده وصف للدور».
- **Fear framing about pain, posture, imaging or injury** («ركبتك هتبوظ»، «ضهرك هيتدمر»).
- **Absolute claims the evidence doesn't support:** «مالوش أي فايدة»، «أكيد»، «دايمًا»، «عمره ما».
- **Invented specifics:** client stories, DMs, numbers, quotes, study results.

## Endings

- No generic "go see a professional" close as the default. v3 had it in 4 of 5 approved
  reels («اتقيّم»، «كلّم مختص»، «وريه لمختص»). It's appropriate when there's a real red flag,
  and then it's specific (what sign, why). Collection cap: 1.
- The ending has to be earned. It resolves the hook, or it gives one action the viewer can
  take today.
- Don't end two scripts in the same series with the same sentence shape.
