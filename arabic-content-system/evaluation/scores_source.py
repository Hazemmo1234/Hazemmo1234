"""Rubric scores (system/RUBRIC.md) for v3 original, v4 pass 1 and v4 final.

Scored by the editor (Claude) in one sitting with the same rubric. These are editorial
judgements, NOT predictions of retention or reach. (J) = judgement, (F) = checkable fact.
Run:  python3 -I evaluation/scores_source.py   -> writes evaluation/scores.json
"""
import json
from pathlib import Path

D = ["hook", "narrative", "voice", "relevance", "originality", "clarity", "practical", "accuracy"]
MAX = dict(hook=15, narrative=20, voice=15, relevance=10, originality=10, clarity=10, practical=10, accuracy=10)

S = {}

def put(sid, version, scores, notes=None, summary=""):
    S.setdefault(sid, {})[version] = {"scores": dict(zip(D, scores)), "notes": dict(zip(D, notes)) if notes else {}, "summary": summary}

# ---------------- A1
put("A1", "v3", [11, 13, 10, 7, 7, 7, 4, 9], [
 "(J) «أكبر حمل… مش وانت بتستريتش. وانت بتجري» is specific, and the stretching contrast is a real scroll-stopper.",
 "(J) Logical order, but the «هوك النص» only restates the mechanism. The Nordic stat arrives with no bridge.",
 "(F) 3 contrast reveals in 77 words (lint). «البرنامج كله، مش النوردك لوحده» is a written-style afterthought.",
 "(J) Runners and footballers, but no lived situation is named.",
 "(J) The lengthening-under-load mechanism plus the 'programme, not exercise alone' nuance is above typical IG content.",
 "(F) 35–43 s est., within range; the trailing qualifier clutters the ending.",
 "(F) Ends on «اتقيّم» with no action.",
 "(F) Both claims match Sun 2015 and van Dyk 2019; the shooting note flags the mechanism as probable."])
put("A1", "pass1", [12, 16, 12, 8, 8, 4, 7, 9], summary="Fixed the contrast tic and added the 1.4× number as an escalating middle hook, but grew to 109 words (est. 50–61 s vs 35–45). Lint FAIL: too_long.")
put("A1", "final", [12, 16, 13, 8, 8, 8, 7, 9], [
 "(J) «فيه لحظتين في الجري السريع، الهامسترينج فيهم شايل أتقل حمل» is specific and visual, but less provocative than v3's stretching contrast. v3's hook is kept as [ALT] for an A/B test. Only +1.",
 "(J) Moment → mechanism → escalating number («عدّى أقصى قوة… بحوالي 40%») → myth correction → proof → audit question. Each beat is new.",
 "(F) 0 contrast reveals; «بتتمط وهي شادّة، بتفرمل الركبة» is natural gym Egyptian.",
 "(J) The ending addresses the viewer whose strain keeps coming back.",
 "(J) The 40% figure is uncommon in Arabic fitness content (judgement, not checked against competitors).",
 "(F) 85 words, est. 39–48 s, at the upper edge of the target.",
 "(J) The audit question «آخر مرة عضلتك اتدرّبت وهي بتتمط تحت حمل… كانت إمتى؟» is actionable, but there's no how-to for the Nordic. Remaining weakness.",
 "(F) Sun 2015: knee muscle torque 1.4× max isometric in initial stance (n = 8, on screen). van Dyk 2019 RR 0.49 for programmes including the NHE. «الأسباب كتير» keeps it multifactorial."],
 "Contrast tic removed, escalating middle hook added, generic referral replaced by an audit question. Hook not clearly better than v3, so v3's is kept as ALT.")

# ---------------- B1
put("B1", "v3", [10, 12, 9, 8, 6, 6, 5, 9], [
 "(J) Relatable scenario, but «بالحاجة الغلط» is vague. It doesn't say what was being measured.",
 "(J) The line model is good and «الوجع ممكن يروح وانت لسه هنا» is a genuine middle hook, but a disclaimer opens the body.",
 "(F) MSA «فإن الوجع راح», 2 contrast reveals, a spoken disclaimer «الرسم ده للتوضيح، مش أرقام».",
 "(J) The return-to-sport viewer will recognise it.",
 "(J) The capacity-gap concept is known in rehab circles, though rarer in Egyptian IG.",
 "(F) 2 spoken disclaimers (~13 of 74 words).",
 "(J) «قوة، ونط، ونَفَس» lists categories, not tests.",
 "(F) No numbers; the on-screen label prevents the graphic being read as data."])
put("B1", "pass1", [12, 15, 12, 8, 7, 5, 7, 9], summary="Hook names the wrong measure («بالوجع»), disclaimer moved on screen, tests named, but 93 words (est. 43–52 s vs 34–42). Lint FAIL.")
put("B1", "final", [12, 15, 13, 8, 7, 8, 7, 9], [
 "(J) «يمكن كنت بتقيس جاهزيتك بالوجع» names the specific mistake while keeping v3's honest «يمكن».",
 "(J) Model → middle hook (kept from v3) → «طب تعرف إزاي إنك وصلت فوق؟» opens a second question that the tests answer.",
 "(F) MSA and contrast reveals removed; «قصاد السليمة» is natural comparison Egyptian.",
 "(J) Unchanged. Already good in v3.",
 "(J) +1: the ending reframes pain as a signal of healing, not of readiness. Still a known concept.",
 "(F) 77 words, est. 35–43 s, on target; disclaimer on screen; CTA moved to the caption.",
 "(J) Names three test domains but gives no thresholds. Adding sport-specific criteria (e.g. ≥90% limb symmetry, from ACL literature) is Hazem's call. Remaining weakness.",
 "(F) Unchanged; nothing overstated."],
 "Below the 80 bar (79). Moving practical value needs a decision on whether to state a benchmark that comes from ACL-specific research.")

# ---------------- A2
put("A2", "v3", [9, 13, 10, 8, 6, 6, 6, 9], [
 "(J) «كاحلك بطّل يوجعك؟ حلو. بس ده مش معناه…» is a common take that opens on a contrast.",
 "(J) Number → better number → demo, but a disclaimer line («ده مش اختبار ولا تشخيص… مجرد ملاحظة») stalls the end.",
 "(F) 2 contrast reveals plus a spoken disclaimer.",
 "(J) Anyone who's sprained an ankle.",
 "(J) The proprioception-after-sprain message is fairly common.",
 "(F) 40–49 s est., about 10% of words are disclaimer.",
 "(J) The demo is useful, but it ends on «كلّم مختص».",
 "(F) 500+, ~1/3 and 22% match Hupperets 2009 (522; 33% vs 22%)."])
put("A2", "pass1", [12, 15, 12, 8, 7, 7, 8, 9], summary="Number hook, disclaimers moved on screen, demo kept. Ending shape duplicated B1 (pain vs X aphorism). Question hook (4/5 approved reels opened with a question).")
put("A2", "final", [13, 15, 13, 8, 7, 8, 8, 9], [
 "(J) «واحد من كل تلاتة رياضيين لووا كاحلهم، لواه تاني في نفس السنة» is a hard number, immediately relevant, and a statement (fixes the batch's question-hook pattern).",
 "(J) Number → comparison middle hook (22%) → implication → demo → reframe.",
 "(F) 0 contrast reveals, 0 spoken disclaimers.",
 "(J) Unchanged.",
 "(J) +1: the closing reframe «ماتسألش «لسه بيوجع؟». اسأل «بيسندني؟»» is memorable.",
 "(F) 83 words, est. 38–47 s.",
 "(J) Do-it-now demo plus a question the viewer can keep using.",
 "(F) Absolute numbers (33%→22%) on screen; the hook generalises one trial's control group, and the next line names the trial."],
 "Clear improvement in hook, flow and language; accuracy unchanged (already correct).")

# ---------------- B2
put("B2", "v3", [8, 13, 11, 7, 8, 5, 5, 9], [
 "(J) Two stacked questions plus the vague tease «ساعات الإجابة بتبقى في النص».",
 "(J) Two trials in sequence work; the spoken disclaimer «مش قاعدة لكل الناس» deflates the middle.",
 "(J) Natural, but written-register stretches («إنك تخفف الحمل فترة، ده ممكن يبقى صح»).",
 "(J) 'Tendon' is abstract; no situation.",
 "(J) Injection vs heavy slow resistance is a distinctive comparison.",
 "(F) Longest approved reel (47–57 s est.) with a disclaimer line.",
 "(J) «يتظبط على قد حالتك» is abstract, and it ends on «اتقيّم».",
 "(F) Silbernagel (n = 38) and Kongsgaard (n = 39) described correctly."])
put("B2", "pass1", [12, 15, 12, 8, 8, 6, 9, 9], summary="'Third option' hook, pain-monitoring rule as payoff; 100 words (est. 46–56 s vs 40–50).")
put("B2", "final", [12, 16, 13, 8, 8, 8, 9, 9], [
 "(J) «قدامك اختيارين مشهورين… التجارب ليها رأي تالت» is a concrete choice with a real gap.",
 "(J) Prediction → result («والاتنين اتحسنوا قد بعض») → stakes reveal («بعد 6 شهور التحسن رجع لورا») → rule.",
 "(F) No disclaimers or contrasts; «هدي لحد الصبح؟ كمّل… زاد يوم عن يوم؟ خفف» sounds spoken.",
 "(J) +1: names the two options the viewer is actually offered.",
 "(J) Unchanged; already distinctive.",
 "(F) 92 words, est. 42–52 s.",
 "(J) The next-morning pain rule is an action the viewer can apply tonight.",
 "(F) Both trials are on cards with their n; the trials are not conflated; no pain-score number given (secondary sources conflict)."],
 "Biggest gain in practical value.")

# ---------------- B3
put("B3", "v3", [13, 12, 12, 6, 7, 8, 5, 9], [
 "(J) «اقف قدام حيطة، وفي 30 ثانية هتعرف…» is a strong do-it-now hook. Preserved.",
 "(J) Clear instructions, but the middle hook «فيه هامش خطأ» is vague, and the script ends by deferring.",
 "(J) Natural instruction language.",
 "(J) Doesn't say why the viewer should care about ankle bend.",
 "(J) The knee-to-wall test is known; the honest framing is good.",
 "(F) 41–50 s est.",
 "(F) No measurement, no use for the number; ends on «وريه لمختص».",
 "(F) Correctly avoids normal values."])
put("B3", "pass1", [12, 15, 12, 8, 8, 4, 9, 9], summary="Replaced the hook with a squat question (lost the strong v3 hook), added MDC and re-test logic; 115 words (est. 53–65 s vs 38–47). Lint FAIL.")
put("B3", "final", [13, 15, 12, 7, 8, 8, 9, 9], [
 "(J) v3 hook restored (pass 1 had replaced a strong line: an excessive-rewrite error caught in review).",
 "(J) Instructions → a concrete middle hook («ممكن يختلف لحد 2 سنتي لو عدته») → limits → re-test payoff.",
 "(J) Unchanged. Already natural.",
 "(J) +1: squat heel-rise is mentioned, but later and weaker than in pass 1. A trade-off.",
 "(J) Using the measurement error to tell real change from noise is rare in IG content (judgement).",
 "(F) 91 words, est. 42–51 s.",
 "(J) Measure → train → re-test, with a threshold.",
 "(F) Powden 2015 MDC 1.6–1.9 cm; applying it to between-leg differences is flagged as an approximation in NOTES."],
 "Practical value from 5 to 9. Relevance gain smaller than in pass 1 because the strong v3 hook was kept.")

# ---------------- EP01
put("EP01", "v3", [11, 16, 13, 7, 9, 4, 6, 9], [
 "(J) Name plus mystery, but «فاته لقب 2010 كله» is ambiguous (Egypt won it) and it opens on a contrast.",
 "(J) Real turn («شحاتة كان مستعد يستناه. بس…»), science bridge, earned ending.",
 "(J) Natural; «العضمة مالهاش دعوة الماتش قد إيه مهم» is the best line in the PDF.",
 "(J) Football fans; the injury lesson is indirect.",
 "(J) Uses a national story to teach readiness. Distinctive.",
 "(F) Est. 57–69 s against the section's own 45–55 s target.",
 "(J) A decision lesson, not an action.",
 "(F) Careful «ممنوع يتقال» discipline; tournament facts confirmed independently this session."])
put("EP01", "pass1", [13, 16, 13, 7, 9, 4, 6, 9], summary="New hook «بطلب منه هو»; still 121 words (est. 56–68 s). Lint FAIL.")
put("EP01", "final", [13, 16, 13, 7, 9, 8, 6, 9], [
 "(J) «غاب عن بطولة 2010 كلها. بطلب منه هو» is a sharper surprise, and attributed in the middle hook.",
 "(J) Unchanged. Already strong.",
 "(J) Unchanged; protected lines kept verbatim.",
 "(J) Not improved. Story format.",
 "(J) Unchanged.",
 "(F) 103 words, est. 47–58 s (was 57–69).",
 "(J) Not improved: the story teaches a decision, not a drill. Acceptable for this series.",
 "(F) Unchanged; «الأهلي بيقول» keeps the 40-day figure attributed."],
 "Mainly a compression and hook edit. The protected lines are untouched.")

# ---------------- EP02
put("EP02", "v3", [9, 14, 12, 6, 8, 5, 5, 9], [
 "(J) Three sentences of setup before the hook lands; the famous payoff is hidden.",
 "(J) Good turn and ending, but listing the three injury accounts costs about 8 s.",
 "(J) Natural.",
 "(J) Football fans; weak link to the viewer.",
 "(J) The 'won it with a duel on a bad ankle' angle is strong.",
 "(F) Est. 53–65 s vs 45–55 s.",
 "(J) The general ankle line is informative, not actionable.",
 "(F) Accounts not presented as fact; substitution reason stated as unknown."])
put("EP02", "pass1", [13, 15, 13, 6, 8, 5, 5, 9], summary="Payoff-first cold open; three accounts moved to a card; still 112 words (est. 52–63 s).")
put("EP02", "final", [13, 16, 13, 7, 8, 7, 6, 9], [
 "(J) «الالتحام اللي جاب جول نهائي 2008، عمله لاعب كاحله كان متصاب من حوالي أسبوع» opens on the famous moment.",
 "(J) Cold open → context → «لسه مش عارف» turn → the minutes → payoff that closes the loop.",
 "(J) +1 from cutting the three-account list.",
 "(J) +1: «لو كاحلك انت اتلوى» brings the viewer in.",
 "(J) Unchanged.",
 "(F) 108 words, est. 50–61 s, at the target's upper edge.",
 "(J) Walking pain-free is named as only the start. Still light.",
 "(F) «حوالي أسبوع» is an approximation (injury before 4 Feb, final 10 Feb), noted."],
 "Below the bar (79). Story length is the constraint: adding more viewer value means cutting story detail, which is an editorial call for Hazem.")

# ---------------- GEDO
put("GEDO", "v3", [14, 13, 11, 5, 8, 7, 2, 8], [
 "(J) «هدّاف أمم أفريقيا 2010 مابدأش ولا ماتش» is the strongest hook in the PDF. A paradox in 7 words.",
 "(J) Facts, then the role, then «ده مش تفسير لجوانه. ده وصف للدور» argues with no one.",
 "(F) 2 contrast reveals in the explanation.",
 "(J) No link to the viewer's own training.",
 "(J) The substitute-physiology angle is fresh.",
 "(F) 41–50 s est.",
 "(J) No takeaway.",
 "(F) «والكاف بعدها سمّته» isn't supported by the cited source (Ahram Online documents the nickname, not who gave it)."])
put("GEDO", "pass1", [14, 14, 13, 6, 8, 8, 3, 9], summary="Arguing-with-no-one removed, CAF attribution corrected, 85' detail added; no viewer takeaway yet.")
put("GEDO", "final", [14, 14, 13, 7, 8, 7, 6, 9], [
 "(J) Kept verbatim. Not improvable by rewriting.",
 "(J) +1: the 85' detail sharpens the middle; the EPL data line is now framed without arguing.",
 "(F) 0 contrast reveals.",
 "(J) +2: the amateur 5-a-side substitute line.",
 "(J) Unchanged.",
 "(F) 97 words, est. 45–55 s, around the target's upper edge. Not improved.",
 "(J) +4: «فضل سخّن على الخط» gives one action (principle, not trial-based).",
 "(F) CAF attribution corrected; EPL data from Bradley 2013/2014 described accurately."],
 "Below the bar (78). It's an optional companion story; length is its limit.")

# ---------------- EP1
put("EP1", "v3", [11, 11, 12, 7, 7, 9, 6, 7], [
 "(J) The series refrain from a rehab coach is a strong thumb-stop and is qualified within 2 s.",
 "(J) Three parallel conditions; the first («لو مالوش علاقة باللي هتلعبه») is vague, and the stretch line duplicates EP3.",
 "(J) Natural.",
 "(J) General gym audience.",
 "(J) The series format is distinctive; this episode's content is generic.",
 "(F) 18–21 s.",
 "(J) The fatigue condition is actionable; the others are vague.",
 "(J) 'Useless' is an exaggeration device; the stretch line repeats EP3's science."])
put("EP1", "pass1", [11, 13, 13, 8, 8, 9, 8, 8], summary="Concrete conditions (walking only before a sprint, waiting 30 min); stretch line removed to avoid duplicating EP3.")
put("EP1", "final", [11, 14, 13, 8, 8, 9, 8, 8], [
 "(J) Unchanged. Series format.",
 "(J) +3: concrete conditions plus a one-line mechanism («العضلة بتبرد تاني»), but still a list, so medium band.",
 "(J) +1.",
 "(J) +1: the sprint and bench-waiting situations are recognisable.",
 "(J) +1: the 'waited too long' condition is uncommon.",
 "(F) Unchanged, 20–25 s.",
 "(J) +2: «بيبدأ هادي، ويعلى لحد ما يشبه اللي هتعمله» is a usable rule.",
 "(J) +1: conditions supported by McGowan 2015 and Bishop 2003; 'useless' is still the series' exaggeration."],
 "Below the bar (79) because the ≤25 s list format caps the narrative score. Changing the series format needs Hazem's approval.")

# ---------------- EP2
put("EP2", "v3", [11, 11, 13, 8, 8, 9, 6, 8], [
 "(J) Provocative for a rehab account; brand-adjacent.",
 "(J) Conditions without proof; «لو مالوش علاقة برياضتك» repeats EP1's «مالوش علاقة» construction.",
 "(J) Natural and rhythmic.",
 "(J) Anyone stuck in rehab.",
 "(J) The brand line is distinctive.",
 "(F) 17–20 s.",
 "(J) «بنفس الوزن» is useful; the rest is vague.",
 "(J) Principle-based and labelled as such."])
put("EP2", "pass1", [11, 14, 13, 9, 8, 5, 8, 9], summary="Added the red-band image and the Kongsgaard 15→6 progression; 55 words (est. 25–31 s, over 25). Lint FAIL.")
put("EP2", "final", [11, 15, 13, 9, 8, 9, 8, 9], [
 "(J) Unchanged. Series format.",
 "(J) +4: condition → proof («الوزن كان بيتقل: من 15 عدة، لـ 6») → condition → brand line.",
 "(J) Unchanged.",
 "(J) +1: «3 شهور بنفس الباند الأحمر» is a concrete image.",
 "(J) Unchanged.",
 "(F) 43 words, est. 20–24 s.",
 "(J) +2.",
 "(F) +1: the progression was verified in the Kongsgaard 2009 full text (15RM → 6RM over 12 weeks)."],
 "Brand line kept verbatim; proof added.")

# ---------------- EP3
put("EP3", "v3", [11, 11, 12, 7, 6, 9, 7, 6], [
 "(J) Series refrain.",
 "(J) Three conditions; the injury line is a bare assertion.",
 "(J) Natural.",
 "(J) Gym-goers who stretch before lifting.",
 "(J) Common topic.",
 "(F) 18–23 s.",
 "(J) «خليه قصير، وبعده حركة» is actionable.",
 "(F) «وفاكره هيحميك من الإصابات؟ لوحده كده… مالوش لازمة» overstates it: Behm 2015 recommends stretching inside a warm-up with dynamic activity to reduce muscle injuries."])
put("EP3", "pass1", [11, 14, 12, 7, 7, 6, 8, 9], summary="Injury claim corrected into a myth→nuance turn; 52 words (est. 24–29 s). Over 25.")
put("EP3", "final", [11, 15, 13, 8, 7, 9, 8, 9], [
 "(J) Unchanged. Series format.",
 "(J) +4: condition with cost → injury myth → nuance («جوه تسخين فيه حركة، ممكن يقلل إصابات العضل») → rule.",
 "(J) +1.",
 "(J) +1: «بتمسك الخلفية دقيقة وأكتر قبل السكوات» is a concrete habit.",
 "(J) +1: the nuance that it helps *inside* a warm-up is less commonly said.",
 "(F) 44 words, est. 20–25 s.",
 "(J) +1: «أقل من دقيقة، وبعده حركة».",
 "(F) +3: matches Behm 2015 (≥60 s −4.6% vs <60 s −1.1%; no clear effect on all-cause injuries; recommended within a dynamic warm-up for muscle injuries)."],
 "The main scientific correction in the series.")

# ---------------- EP5
put("EP5", "v3", [11, 10, 12, 8, 6, 8, 5, 5], [
 "(J) Series refrain.",
 "(J) «مالوش لازمة لو نوعه مش ماشي مع هدفك» is vague and adds nothing new.",
 "(J) Natural.",
 "(J) Lifters who do cardio.",
 "(J) The interference topic is common.",
 "(F) 21–25 s.",
 "(J) «بالجرعة اللي تخدم هدفك» doesn't say what the dose is.",
 "(F) «مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم» contradicts the PDF's own «مش بنقول» note and Wilson 2012 (concurrent hypertrophy ES 0.85 vs 1.23: smaller, not zero)."])
put("EP5", "pass1", [11, 13, 11, 8, 7, 9, 6, 9], summary="Claim corrected and running vs cycling added; the opening «…لو هدفك عضل… ؟» read awkwardly.")
put("EP5", "final", [11, 15, 13, 8, 7, 9, 8, 9], [
 "(J) Unchanged. Series format.",
 "(J) +5: data reveal («عضلهم زاد… بس أقل») → twist («الجري أثّر، والعجلة لأ») → rule.",
 "(J) +1.",
 "(J) Unchanged.",
 "(J) +1: the running-vs-cycling detail is less known.",
 "(F) 40 words, est. 18–23 s.",
 "(J) +3: «عجلة أكتر، وجري أقصر» (an applied principle, labelled in NOTES).",
 "(F) +4: matches Wilson 2012 (21 studies; running, not cycling, significantly reduced gains; duration and frequency inversely related)."],
 "The script that contradicted its own source now matches it.")

out = {"dimensions": D, "max": MAX, "scripts": {}}
for sid, versions in S.items():
    out["scripts"][sid] = {}
    for v, rec in versions.items():
        rec["total"] = sum(rec["scores"].values())
        assert all(rec["scores"][d] <= MAX[d] for d in D), (sid, v)
        out["scripts"][sid][v] = rec
Path(__file__).with_name("scores.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
for sid, versions in out["scripts"].items():
    print(sid, {v: r["total"] for v, r in versions.items()})
