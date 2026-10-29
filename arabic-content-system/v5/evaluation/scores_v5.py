"""10×10 rubric scores (content_system/guides/rubric.md) for v3 (original PDF), v4 (previous
attempt) and v5 (this rewrite). Scored by the editor (Claude) in one sitting.
Editorial diagnostics only: no score predicts reach or retention. (J) judgement, (F) fact.
"""
import json
from pathlib import Path

D = ["opening", "coherence", "progression", "middle_hook", "egyptian", "originality", "concision", "payoff", "integrity", "spoken"]
S = {}

def put(sid, v3, v4, v5, j3, j5, n4):
    S[sid] = {"v3": dict(zip(D, v3)), "v4": dict(zip(D, v4)), "v5": dict(zip(D, v5)),
              "why_v3": dict(zip(D, j3)), "why_v5": dict(zip(D, j5)), "note_v4": n4}

put("A1", [7,7,6,5,6,7,7,4,9,7], [7,8,8,7,8,7,7,6,9,7], [8,8,8,7,8,7,8,7,9,8],
 ["(J) «أكبر حمل… مش وانت بتستريتش» specific but opens on a contrast",
  "(J) follows, but the Nordic number arrives with no bridge",
  "(J) mechanism → stat → referral; nothing escalates",
  "(J) «العضلة بتطول وهي شغالة» restates; not a turn",
  "(F) 3 contrast reveals in 77 words",
  "(J) the lengthening-under-load angle is above typical",
  "(F) est. 35–43 s",
  "(F) ends «اتقيّم»",
  "(F) matches Sun 2015 / van Dyk 2019",
  "(J) the fragments «وانت بتجري. وفي لحظتين بالذات.» read written"],
 ["(J) «بتجري على كورة طويلة، وفجأة إيدك على ورا رجلك» is a scene every footballer has lived",
  "(J) scene → when → mechanism → number → myth → proof → question",
  "(J) each beat new; the 40% escalates the mechanism",
  "(J) the 40% figure is a real escalation",
  "(F) 0 contrasts over cap, 1 colon",
  "(J) unchanged angle",
  "(F) 87 words, est. 40–49 s (target 35–45)",
  "(J) the audit question is actionable; no Nordic how-to",
  "(F) unchanged; «أول سؤال» plus on-screen multifactor note",
  "(J) flows aloud"],
 "Contrast tic fixed; v4 hook was a moment statement, weaker as a scene")

put("B1", [6,7,6,7,5,6,5,5,9,6], [7,8,7,7,7,6,8,6,9,7], [8,8,7,6,8,7,9,8,9,8],
 ["(J) «يمكن كنت بتقيس بالحاجة الغلط» is vague", "(J) model is clear", "(J) model → mid → abstract list",
  "(J) «الوجع ممكن يروح وانت لسه هنا» is a genuine turn", "(F) MSA «فإن», 2 contrasts", "(J) known concept",
  "(F) 2 spoken disclaimers", "(J) «قوة، ونط، ونَفَس» categories, not tests", "(F) no numbers; label on screen", "(J) disclaimers break the flow"],
 ["(J) «أسبوعين من غير وجع، رجعت الملعب، وفي أول سبرنت اتصبت تاني» is the viewer's story in one breath",
  "(J) scene → what pain was telling you → model → test", "(J) good, but the middle is one line",
  "(J) the mid line is shorter than v3's; the reveal now sits in LINE 1", "(F) no MSA, no colon tics",
  "(J) «الوجع كان بيقولك… ماكانش بيقولك…» reframes", "(F) 73 words, est. 34–41 s", "(J) a concrete compare-three-things test plus a decision rule",
  "(F) no overclaim; no threshold invented", "(J) flows"],
 "v4 had 4 «X: Y» colons")

put("A2", [5,7,7,7,6,5,6,5,9,7], [8,8,7,7,8,6,8,7,9,7], [8,8,8,7,8,6,8,8,9,8],
 ["(J) «كاحلك بطّل يوجعك؟ حلو. بس…» is a common take", "(J) clear", "(J) number → number → demo",
  "(J) the 22% comparison works", "(F) 2 contrasts plus a spoken disclaimer", "(J) common topic", "(F) est. 40–49 s with a disclaimer line",
  "(F) «كلّم مختص»", "(F) numbers match Hupperets", "(J) disclaimer line awkward"],
 ["(J) «لويت كاحلك، ريّحته، وخف. وبعد كام شهر، اتلوى تاني» is a lived sequence", "(J) clear", "(J) scene → how common → what changed it → try it → reframe",
  "(J) the 22% comparison", "(F) clean", "(J) unchanged topic", "(F) 85 words, est. 39–48 s", "(J) demo plus the «بيسندني» reframe",
  "(F) absolute numbers; n on screen", "(J) flows"],
 "Number hook; v5 moves to a scene")

put("B2", [5,7,6,6,7,7,5,5,9,6], [7,8,8,8,7,7,7,8,9,7], [8,8,8,8,8,7,7,8,9,8],
 ["(J) two questions plus a vague tease", "(J) ok", "(J) trials then caveat", "(J) the Achilles result", "(J) some written register",
  "(J) the injection vs HSR comparison is distinctive", "(F) 47–57 s, longest", "(J) «يتظبط على قد حالتك» abstract + «اتقيّم»", "(F) correct", "(J) dense"],
 ["(J) «واحد يقولك ريّح خالص، وواحد يقولك خد حقنة» puts the advice people actually hear in their mouths", "(J) clear", "(J) advice → trial 1 → trial 2 (stakes) → rule",
  "(J) «وبعد 6 شهور التحسن رجع لورا»", "(F) no colon tics (v4 had 4)", "(J) unchanged", "(F) 96 words, est. 44–54 s",
  "(J) next-morning rule", "(F) trials separate, n on cards", "(J) flows"],
 "v4 content kept, colon tic removed")

put("B3", [8,7,6,5,7,6,7,4,9,8], [8,8,7,8,7,7,7,8,9,7], [8,8,7,8,8,7,7,8,9,8],
 ["(J) strong do-it-now", "(J) clear instructions", "(J) instructions → vague caveat → referral", "(J) «هامش خطأ» vague",
  "(J) natural", "(J) known test", "(F) est. 41–50 s", "(F) no use for the number; «وريه لمختص»", "(F) correct", "(J) good"],
 ["(J) same hook (kept: still the best)", "(J) clear", "(J) instructions → error → limits → re-test",
  "(J) «ممكن يختلف لحد 2 سنتي» concrete", "(F) clean", "(J) re-test framing uncommon", "(F) 89 words, est. 41–50 s",
  "(J) measure → train → re-test with a threshold", "(F) MDC approximation flagged", "(J) flows"],
 "Same content as v5 except CTA moved to the caption")

put("EP01", [6,7,5,7,7,7,4,6,9,6], [7,7,5,7,7,7,7,6,9,7], [9,9,9,9,8,8,7,8,9,8],
 ["(J) «فاته لقب 2010 كله» is ambiguous: Egypt won it", "(J) follows", "(J) «21 نوفمبر 2009… آخر ديسمبر… 10 يناير» is a timeline, no stakes",
  "(J) the Shehata/Aboutrika turn is real", "(J) natural", "(J) good subject", "(F) est. 57–69 s vs its own 45–55 s target",
  "(J) the «لسه» ending is good but generic-ish", "(F) careful sourcing", "(J) date-heavy lines are hard to follow by ear"],
 ["(J) «مصر كسبت… من غير ولا خسارة، وأبو تريكة ما لعبش ولا دقيقة. والسبب اتعرف بعدها بسبع سنين» poses a real question",
  "(J) stakes (Omdurman) → injury → dilemma (40 days) → reveal → why → consequence → insight",
  "(J) every beat raises the stakes or answers the question", "(J) the reveal is held to the middle and paid plainly",
  "(J) natural; one colon, at the payoff", "(J) the Omdurman → 4–0 arc wasn't in v3", "(F) 117 words, est. 54–66 s (target 50–60)",
  "(J) «اتعرف بالجوان الكبيرة… أهم حاجة عملها كانت كلمة واحدة: لسه»", "(F) Omdurman, 6/6 and 4–0 verified; 40-day arithmetic in NOTES",
  "(J) chronology clear by ear"],
 "v4 was 82% identical to v3: hook and compression only")

put("EP02", [5,6,5,7,7,7,5,5,9,6], [8,7,6,7,6,7,6,6,9,7], [8,9,9,8,8,8,7,8,9,8],
 ["(J) three sentences give the whole setup; nothing is held", "(J) jumps between accounts", "(J) list of accounts and minutes",
  "(J) «لسه مش عارف» is good", "(J) natural", "(J) the duel angle is strong", "(F) est. 53–65 s", "(J) the ending connects to the ankle",
  "(F) honest about the unknowns", "(J) reading the 3 accounts aloud is heavy"],
 ["(J) «سنة 2006، مصر كسبت… وزيدان ماكانش في الفرقة. كان اختار ناديه» opens a debt the story repays",
  "(J) chronological and clear", "(J) missed title → two goals v Cameroon → injury → bench → Cameroon again → the duel",
  "(J) the setback beat plus the rematch reveal («قدام الكاميرون تاني»)", "(F) 0 colons (v4 had 5)",
  "(J) the bookend wasn't in v3 or v4", "(F) 109 words, est. 50–61 s", "(J) the insight ties the duel to the ankle",
  "(F) opener 4–2 with Zidan 17'/45' verified; minute discrepancy handled", "(J) present-tense action works"],
 "v4 = payoff-first cold open with 5 colon reveals")

put("GEDO", [9,7,5,6,6,7,7,3,7,8], [9,7,6,7,8,7,7,5,9,8], [9,8,8,8,8,8,7,6,9,8],
 ["(J) best hook in the PDF", "(J) ok", "(J) facts then the role", "(J) the final goal", "(F) «ده مش… ده…» arguing with no one",
  "(J) the sub angle is fresh", "(F) est. 41–50 s", "(J) no takeaway", "(F) «والكاف بعدها سمّته» unsupported", "(J) good"],
 ["(J) kept verbatim; still the best", "(J) clear", "(J) unknown (2-week debut) → always on the bench → goals get heavier → why subs can",
  "(J) the escalation QF → SF → final is real", "(F) clean", "(J) the debut and minutes facts are new", "(F) 107 words, est. 49–60 s",
  "(J) the 5-a-side re-warm-up line is one action", "(F) debut, minutes and goals verified; discrepancies ranged", "(J) flows"],
 "v4 added the CTA but kept v3's fact list")

put("EP1", [7,6,5,5,7,5,8,5,6,8], [7,7,6,7,8,7,8,7,8,8], [7,7,7,7,8,7,8,8,8,8],
 ["(J) series refrain", "(J) ok", "(J) parallel list", "(J) none real", "(J) natural", "(J) generic conditions", "(F) 18–21 s",
  "(J) vague condition", "(J) the stretch line duplicates EP3", "(J) good"],
 ["(J) series refrain", "(J) ok", "(J) conditions now follow the warm-up in time (during → end → after); still a list (format)", "(J) «قعدت على الدكة نص ساعة. العضلة بتبرد تاني» is the surprising one, placed last",
  "(J) natural", "(J) the bench condition links to GEDO", "(F) est. 20–25 s", "(J) the 3-part rule answers each condition",
  "(J) conditions match McGowan / Bishop; 'useless' is the series exaggeration", "(J) good"],
 "v5 second pass: conditions reordered, new ending that resolves all three")

put("EP2", [7,6,5,5,8,7,8,5,7,8], [7,8,7,7,8,7,8,7,9,7], [7,8,7,7,8,7,8,7,9,8],
 ["(J) refrain", "(J) ok", "(J) conditions without proof", "(J) none", "(J) natural", "(J) brand line", "(F) 17–20 s", "(J) vague third condition", "(J) principle", "(J) good"],
 ["(J) refrain", "(J) ok", "(J) condition → proof → condition → brand line", "(J) the 15 → 6 proof", "(J) natural", "(J) unchanged",
  "(F) est. 20–25 s", "(J) concrete", "(F) Kongsgaard protocol verified", "(J) the proof is now spoken without a colon"],
 "v5 rewords the proof line only")

put("EP3", [7,6,5,5,7,5,8,6,5,8], [7,8,7,7,8,6,8,7,9,8], [7,8,7,7,8,6,8,7,9,8],
 ["(J) refrain", "(J) ok", "(J) conditions", "(J) none", "(J) natural", "(J) common", "(F) 18–23 s", "(J) «خليه قصير، وبعده حركة»",
  "(F) the injury line overstates Behm 2015", "(J) good"],
 ["(J) refrain", "(J) ok", "(J) condition → myth → nuance → rule", "(J) the nuance turn", "(J) natural", "(J) unchanged", "(F) est. 21–25 s",
  "(J) <60 s plus movement", "(F) matches Behm", "(J) good"],
 "v5 rewords the ending only")

put("EP5", [7,5,5,5,7,5,8,4,4,8], [7,7,7,7,7,6,8,7,9,7], [7,8,7,7,8,6,8,7,9,8],
 ["(J) refrain", "(J) vague", "(J) vague conditions", "(J) none", "(J) natural", "(J) common", "(F) 21–25 s", "(J) no dose given",
  "(F) contradicts its own note and Wilson 2012", "(J) good"],
 ["(J) refrain", "(J) clear", "(J) data → twist → rule", "(J) «الجري أثّر، والعجلة لأ»", "(F) colon tic removed", "(J) unchanged",
  "(F) est. 19–23 s", "(J) «عجلة أكتر، وجري أقصر»", "(F) matches Wilson", "(J) good"],
 "v4's «لو هدفك عضل:» colon removed")

out = {"dimensions": D, "scripts": {}}
for sid, r in S.items():
    for v in ("v3", "v4", "v5"):
        r[v + "_total"] = sum(r[v].values())
    out["scripts"][sid] = r
Path(__file__).with_name("scores_v5.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
avg = lambda v: sum(r[v + "_total"] for r in S.values()) / len(S)
for sid, r in S.items():
    print(f"{sid:5} v3 {r['v3_total']}  v4 {r['v4_total']}  v5 {r['v5_total']}")
print(f"avg   v3 {avg('v3'):.1f}  v4 {avg('v4'):.1f}  v5 {avg('v5'):.1f}")
