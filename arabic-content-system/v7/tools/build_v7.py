"""Build v7/final_scripts_v7.md and .html from v7/scripts (run from anywhere)."""
import html, re, sys
from pathlib import Path
V7 = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(V7.parent / "v6" / "content_system" / "tools"))
from scriptlib import load_dir, spoken_blocks, spoken_text, words, estimate_seconds  # noqa: E402

CHANGE = {
 "S1": "Opens on the decision itself instead of a teaser. The bone science now justifies the decision (the 40-day arithmetic), and the ending is a concrete red flag, not a moral.",
 "S2": "Built on a real contradiction (EFA \"two matches\" vs Liverpool \"3–4 weeks\"). The science explains why both numbers can be honest; no teaser hook, and the second study was removed.",
 "S3": "Rebuilt around one documented sentence from Senegal's coach (\"he knows his body\"). The lesson is why self-judgement fails in concussion; the script says explicitly that the goal proves nothing either way.",
 "S4": "Result first, then backwards through the knee's calendar. One study is spoken, the other becomes a plain fact, and it ends on the documented U23 step instead of a moral.",
 "S5": "The goalkeeper's job explains why this injury matters for him. The golf-ball analogy was replaced by a direct description, and the duplicated \"Egypt out to Congo\" line was removed.",
 "S6": "One estimate followed month by month until it ran out. The cushion analogy was removed; it ends on the fact (Ghana played Africa's first World Cup without him).",
 "S7": "Chronological bookend. The three-injury-accounts line was cut, the science sits at the setback, and the study tag-on at the end is gone.",
 "A1": "Starts from what viewers already do (stretching) and why it isn't enough, plus a usable Nordic description. It no longer repeats S2's sprint-mechanics framing.",
 "B1": "Starts from the viewer's real question. The staircase analogy is gone; three checks they can do themselves, and the training-vs-match distinction.",
 "A2": "The lived sequence plus one number delivered plainly, then what actually needs training and a demo. The «ماتسألش… اسأل» aphorism ending was removed.",
 "B2": "Starts from the viewer's failed rest. The teaser «التجارب جربت الاتنين» is gone; it ends on the practical next-morning rule.",
 "B3": "Direct: what you do, what it measures, what it can't tell you. No analogy, and no 'its real value' formula.",
 "GEDO": "One honest number instead of two stacked ones. The middle line now says plainly that the data doesn't score goals.",
 "EP1": "Series format kept; the repeated «ومالوش لازمة» lines were shortened to «ولا لو…», the way people actually list.",
 "EP2": "Series format kept; the proof line now says it the way a coach would («بدأوا بوزن يشيلوه 15 مرة»).",
 "EP3": "Series format kept; the closing signature line was dropped, so the episode ends on the instruction.",
 "EP5": "Removed «والحقيقة إن…» and the rhetorical question; ends on a concrete instruction for a muscle-gain goal.",
}
SEC = {"injury": "الجزء الأول · سلسلة الإصابات", "approved": "الجزء التاني · الريلز التعليمية", "story": "الجزء التاني · الريلز التعليمية", "maloosh": "الجزء التالت · مالوش لازمة"}

S = load_dir(V7 / "scripts")
def est(s):
    lo, hi = estimate_seconds(len(words(spoken_text(s))))
    return lo, hi

L = ["# سكريبتات الريلز · v7", "",
     "Ready to record. Same order as the v6 collection (series S1–S7, then the PDF's scripts; EP01 = S1 and EP02 = S7). Durations are **approximate**, estimated at ≈1.95 spoken words/second; read each one aloud and time it.", ""]
cur = None
for s in S:
    m = s["meta"]; sid = m["id"]
    if SEC[m["series"]] != cur:
        cur = SEC[m["series"]]; L += [f"## {cur}", ""]
    lo, hi = est(s)
    L += [f"### {sid} · {m['title']}", "", *[t for g, t in spoken_blocks(s)], "",
          f"**المدة التقريبية:** {lo}–{hi} ثانية", "", f"**What changed:** {CHANGE[sid]}", ""]
    ver = [n for n in s["notes"]]
    if ver:
        L += ["**Verification:** " + " ".join(ver), ""]
    L += ["**Sources:** " + " · ".join(s["sources"]), "", "---", ""]
L += [(V7 / "AUDIT.md").read_text(encoding="utf-8")]
(V7 / "final_scripts_v7.md").write_text("\n".join(L), encoding="utf-8")

css = (V7.parent / "v6" / "final_scripts.html").read_text(encoding="utf-8")
css = re.search(r"<style>(.*)</style>", css, re.S).group(1).replace("../deliverables", "../deliverables")
b = ["<h1>سكريبتات الريلز · v7</h1><p class='meta'>@hazemmohamed.rehab · جاهزة للتصوير · المدد تقريبية (≈1.95 كلمة/ثانية)</p>"]
cur = None
for s in S:
    m = s["meta"]
    if SEC[m["series"]] != cur:
        cur = SEC[m["series"]]; b.append(f"<h2>{cur}</h2>")
    lo, hi = est(s)
    b.append(f"<div class='card'><h3>{m['id']} · {html.escape(m['title'])}</h3><div class='meta'>المدة التقريبية: من {lo} لـ {hi} ثانية</div><div class='spoken'>")
    b += [f"<p class='l'>{html.escape(t)}</p>" for g, t in spoken_blocks(s)]
    b.append("</div><div class='notes'><div class='src'>" + "<br>".join(html.escape(x) for x in s["sources"]) + "</div></div></div>")
(V7 / "final_scripts_v7.html").write_text(f"<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>سكريبتات v7</title><style>{css.replace('page-break-inside:avoid;','')} h2:first-of-type{{break-before:auto}}</style></head><body>{''.join(b)}</body></html>", encoding="utf-8")
print("built", len(S), "scripts")
