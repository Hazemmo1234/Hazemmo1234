"""Build the v6 deliverables (run from v6/):  python3 -I content_system/tools/build_v6.py"""
import difflib
import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

V6 = Path(__file__).resolve().parents[2]
ROOT = V6.parent
sys.path.insert(0, str(V6 / "content_system" / "tools"))
from scriptlib import load_dir, spoken_blocks, spoken_text, words, estimate_seconds  # noqa: E402
import lint_scripts as lint  # noqa: E402

ORIG = load_dir(ROOT / "scripts" / "v3_original")
O = {s["meta"]["id"]: s for s in ORIG}
V5 = {s["meta"]["id"]: s for s in load_dir(ROOT / "v5" / "scripts" / "v5_final")}
PA = load_dir(V6 / "scripts" / "partA_final")
SE = load_dir(V6 / "scripts" / "series_final")
SC6 = json.loads((V6 / "evaluation" / "scores_v6.json").read_text(encoding="utf-8"))
SC5 = json.loads((ROOT / "v5" / "evaluation" / "scores_v5.json").read_text(encoding="utf-8"))["scripts"]
LABEL = {"HOOK": "الهوك", "LINE": "", "SCI": "علم", "MID": "هوك النص", "END": "الختام", "CTA": "CTA", "ALT": "بديل (مش بيتقال)"}
SEC = {"approved": "1 · الريلز الخمسة المعتمدة", "story": "2 · حكاية إصابة · جيل الذهب", "maloosh": "3 · مالوش لازمة"}
CORE = {
    "A1": "الوقاية من شد الخلفية بتيجي من تقوية العضلة وهي بتتمط تحت حمل، والستريتش لوحده مش كفاية.",
    "B1": "اختفاء الوجع مش معناه إنك جاهز. الجاهزية بتتقاس قدام اللي رياضتك هتطلبه.",
    "A2": "بعد الالتواء، تمارين الثبات بتقلل الالتواء التاني. الوجع مش المقياس.",
    "B2": "الوتر اللي بيوجع بيتحسن بالحمل المظبوط والمتراقب، مش بالراحة التامة.",
    "B3": "اختبار الركبة للحيطة بيقيس انثناء الكاحل وبس، وليه هامش خطأ.",
    "EP01": "أبو تريكة قال «لسه»: الفرق بين إنك عايز تلعب وإنك جاهز (= حلقة S1).",
    "EP02": "زيدان رجع بالدقايق وكسب الالتحام، والالتحام آخر امتحان للكاحل (= حلقة S7).",
    "GEDO": "هدّاف من على الدكة: البديل بيدخل برجل فريش على ملعب الكل فيه بيقل.",
    "EP1": "التسخين اللي مالوش لازمة هو اللي مابيجهزكش للي جاي.",
    "EP2": "التمرين اللي مابيتقلش ومابيتقاسش هو اللي مالوش لازمة.",
    "EP3": "الستريتش قبل التمرين له لازمة بشروط: قصير، وبعده حركة.",
    "EP5": "الكارديو ليه لازمة، بالنوع والجرعة اللي تخدم هدفك.",
}
DIMS = ["opening", "coherence", "progression", "middle_hook", "egyptian", "originality", "concision", "payoff", "integrity", "spoken"]


def sim(a, b):
    return difflib.SequenceMatcher(None, words(a), words(b), autojunk=False).ratio()


def est(s):
    lo, hi = estimate_seconds(len(words(spoken_text(s))))
    return f"من {lo} لـ {hi} ث"


def spoken_md(s):
    return "\n".join(f"- **{LABEL[t]}** {x}" if LABEL[t] else f"- {x}" for t, x in s["blocks"])


def section(s, key, title):
    return [f"**{title}**"] + [f"- {x}" for x in s[key]] if s[key] else []


def notes_where(s, prefix):
    return [n for n in s["notes"] if n.startswith(prefix) or prefix in n[:40]]


def reg(dir_, cases=None):
    cmd = [sys.executable, "-I", str(V6 / "content_system" / "tests" / "run_regression.py"), str(dir_)] + ([str(cases)] if cases else [])
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    return out, out.strip().splitlines()[-1]


def build_original():
    shutil.copy(ROOT / "v5" / "original_scripts.md", V6 / "original_scripts.md")


def build_partA():
    L = ["# rewritten_scripts.md: Part A, all 12 original scripts rewritten (v6)", "",
         "Original order. Spoken lines only: **الهوك / علم / هوك النص / الختام / CTA** and untagged lines. «علم» marks the science lines. Durations are **estimates** (≈1.95 words/s). EP01 and EP02 are identical to series episodes S1 and S7 (`afcon_injury_series.md`).", ""]
    cur = None
    for s in PA:
        sid, m = s["meta"]["id"], s["meta"]
        if m["series"] != cur:
            cur = m["series"]
            L += [f"## {SEC[cur]}", ""]
        sc = SC6["partA"][sid]
        v6n = [n.replace("v6: ", "") for n in s["notes"] if n.startswith("v6:")]
        L += [f"### {sid} · {m['title']}", "",
              f"**Original topic:** {O[sid]['meta']['title']}  ", f"**Core idea preserved:** {CORE[sid]}  ",
              f"**Estimate:** {est(s)} · {len(words(spoken_text(s)))} words · target {m['target']} s", "",
              "**Final script**", "", spoken_md(s), ""]
        L += section(s, "production", "على الشاشة / تصوير") + [""]
        L += [f"**Key editorial improvements:** {sc['why']}" + (" " + " ".join(v6n) if v6n else ""), ""]
        L += section(s, "sources", "Sources") + ["", "---", ""]
    (V6 / "rewritten_scripts.md").write_text("\n".join(L), encoding="utf-8")


def build_series():
    L = ["# afcon_injury_series.md: the injury series (7 episodes, 7 players, 7 different injuries)", "",
         "Every episode carries three things together: a verified story, the specific injury explained (lines marked **علم**), and a lesson for the viewer. Episodes S1–S6 are built on documented diagnoses. **S7 is a bonus**: Zidan's diagnosis was never made public, so its science is general.", "",
         "| # | Player | Injury | Tournament link | Structure | Estimate |", "|---|---|---|---|---|---|"]
    links = {"S1": "missed AFCON 2010", "S2": "AFCON 2024 (Ivory Coast)", "S3": "AFCON 2022 (Cameroon)", "S4": "ACL in 2021 → AFCON 2022 winner", "S5": "AFCON 2024", "S6": "AFCON 2010 → missed World Cup 2010", "S7": "AFCON 2008 (Ghana)"}
    player = {"S1": "محمد أبو تريكة (مصر)", "S2": "محمد صلاح (مصر)", "S3": "ساديو ماني (السنغال)", "S4": "محمود حسن تريزيجيه (مصر)", "S5": "محمد الشناوي (مصر)", "S6": "مايكل إيسيان (غانا)", "S7": "محمد زيدان (مصر)"}
    for s in SE:
        m = s["meta"]
        L.append(f"| {m['id']} | {player[m['id']]} | {m['injury']} | {links[m['id']]} | {m['structure']} | {est(s)} |")
    L += [""]
    for s in SE:
        sid, m = s["meta"]["id"], s["meta"]
        sci = [x for t, x in spoken_blocks(s) if t == "SCI"]
        end = [x for t, x in spoken_blocks(s) if t == "END"]
        facts = [n for n in s["notes"] if "اتأكد" in n or "مؤكد" in n or "CARRIED" in n]
        limits = [n for n in s["notes"] if any(k in n for k in ("مش معروف", "ممنوع", "مش بنقول", "متضارب", "حلقة إضافية", "علم عام"))]
        L += [f"## {sid} · {m['title']}", "",
              f"**1. Title and angle:** {m['title']} · *{m.get('title_en','')}* · structure: {m['structure']}  ",
              f"**2. Player and injury:** {player[sid]} · {m['injury']}", "",
              "**3. Research-supported facts**", *[f"- {x}" for x in facts], "",
              "**4. Narration (Egyptian Arabic, ready to record)**", "", spoken_md(s), "",
              *section(s, "production", "على الشاشة / تصوير"), "",
              "**5. Injury mechanism / anatomy (as spoken)**", *[f"- {x}" for x in sci], "",
              f"**6. Scientific / rehabilitation lesson:** {SC6['series'][sid]['learn']}", "",
              f"**7. Final payoff:** {end[0] if end else ''}", "",
              f"**8. Estimated spoken duration:** {est(s)} ({len(words(spoken_text(s)))} words; estimate, read aloud 3× to confirm)", "",
              "**9. Sources and factual limitations**", *[f"- {x}" for x in s["sources"]], "", "*Limitations:*", *[f"- {x}" for x in limits], "", "---", ""]
    (V6 / "afcon_injury_series.md").write_text("\n".join(L), encoding="utf-8")


RESEARCH = """# research_and_sources.md: case selection, verification and sources

## How the cases were chosen
Criteria (from the brief): a link to AFCON or African football · a **documented** injury (club/federation statement or reputable reporting) · narrative potential · a **different injury type** in every episode · a real teaching opportunity · relevance to an Egyptian audience.

| Candidate | Injury (as documented) | Decision | Why |
|---|---|---|---|
| Mohamed Aboutrika | metatarsal stress fracture, Nov 2009 → missed AFCON 2010 | **S1** | documented in the Egyptian press; a strong decision story; bone stress lesson |
| Mohamed Salah | hamstring tear, AFCON 2024 v Ghana | **S2** | EFA + Liverpool statements, a documented timeline and return; hamstring lesson (links to A1) |
| Sadio Mané | head collision / suspected concussion, AFCON 2022 R16 | **S3** | widely reported, including Headway's criticism; the concussion protocol lesson |
| Trezeguet | knee ligament (reported as ACL) surgery, Apr 2021 → AFCON 2022 QF winner | **S4** | Villa statement plus a documented comeback; the ACL timeline and criteria lesson |
| Mohamed El Shenawy | shoulder dislocation, AFCON 2024 v Cape Verde | **S5** | EFA statement; the shoulder instability lesson; goalkeeper-specific |
| Michael Essien | knee meniscus tear in training at AFCON 2010 → missed the 2010 World Cup | **S6** | Chelsea/Ancelotti statement plus a stretched timeline; the meniscus lesson |
| Mohamed Zidan | ankle injury, AFCON 2008 (no public diagnosis) | **S7 bonus** | existing story; the ankle lesson is general; limitation stated |
| Gedo | no injury | not in the series | the Part A script is rebuilt as a fatigue/performance-science story instead |
| El Shenawy, AFCON 2022 | muscle strain v Ivory Coast | rejected | the same player as S5; "muscle strain" too vague |
| Essien, 2008/2009 ACL | conflicting reports on date and context | rejected | sources inconsistent |
| Salah, 2018 shoulder | not AFCON; same player as S2 | rejected | |

## Verification method
- Match facts (dates, scores, scorers, minutes): Wikipedia tournament/final pages and their citations, cross-checked with contemporary match reports (AFP/Reuters via Al Jazeera, Africanews, Ahram Online).
- Injury facts: club or federation statements as reported (Aston Villa, Chelsea via AFP, the Egyptian FA, the Ghana FA) and reputable outlets. The earlier v3 research file's news sources are marked **CARRIED** where not re-checked.
- Science: PubMed (abstracts retrieved this session) plus one full text (Kongsgaard 2009).
- Conflicting sources are resolved with ranges in speech («قبل النهاية بربع ساعة تقريبًا») and noted.

## Scientific sources used (all retrieved via PubMed in this or the previous session)

| Claim in the scripts | Source |
|---|---|
| hamstrings 37% of muscle injuries; 16% re-injuries, longer absences | Ekstrand J et al. 2011, Am J Sports Med, doi:10.1177/0363546510395879 |
| hamstring loading at late swing/early stance ≈1.4× max isometric | Sun Y et al. 2015, Med Sci Sports Exerc, doi:10.1249/MSS.0000000000000404 |
| programmes with the Nordic: RR 0.49 | van Dyk N et al. 2019, Br J Sports Med, doi:10.1136/bjsports-2018-100045 |
| concussion: suspected = remove, no same-day return, graded return | Patricios JS et al. 2023 (CISG Amsterdam 2022), Br J Sports Med, doi:10.1136/bjsports-2023-106898 |
| −51% re-injury per month of delay to 9 months after ACLR | Grindem H et al. 2016, Br J Sports Med, doi:10.1136/bjsports-2016-096031 |
| 65% return to pre-injury level after ACLR (69 studies) | Ardern CL et al. 2014, Br J Sports Med, doi:10.1136/bjsports-2013-093398 |
| 39% recurrent instability after a first traumatic anterior dislocation; higher ≤40, men | Olds M et al. 2015, Br J Sports Med, doi:10.1136/bjsports-2014-094342 |
| central two-thirds of the meniscus avascular; peripheral tears heal better | Petersen W et al. 2005, Ann Anat, doi:10.1016/j.aanat.2005.04.010 |
| MT-5 fractures: 33% refractures, 45% prodromal symptoms | Ekstrand J, van Dijk CN 2013, Br J Sports Med, doi:10.1136/bjsports-2012-092096 |
| bone stress injury = damage accumulation from repetitive sub-yield loading | Yan C … Warden SJ 2025, Bone, doi:10.1016/j.bone.2025.117417 |
| ankle re-sprain 33% → 22% with 8-week home balance training | Hupperets MDW et al. 2009, BMJ, doi:10.1136/bmj.b2684 |
| 2nd-half high-intensity drop (−12%); substitutes +15% | Bradley PS & Noakes TD 2013, J Sports Sci, doi:10.1080/02640414.2013.796062 |
| substitutes cover more high-intensity running than the players they replaced | Bradley PS et al. 2014, Int J Sports Physiol Perform, doi:10.1123/ijspp.2013-0304 |
| Achilles: rest vs pain-monitored loading, equal outcomes | Silbernagel KG et al. 2007, Am J Sports Med, doi:10.1177/0363546506298279 |
| patellar tendon: CORT short-term vs HSR lasting; HSR ↑ collagen turnover; 15RM → 6RM | Kongsgaard M et al. 2009, Scand J Med Sci Sports, doi:10.1111/j.1600-0838.2009.00949.x |
| knee-to-wall MDC 1.6–1.9 cm | Powden CJ et al. 2015, Man Ther, doi:10.1016/j.math.2015.01.004 |
| stretching ≥60 s −4.6% vs <60 s −1.1%; recommended within a dynamic warm-up | Behm DG et al. 2016, Appl Physiol Nutr Metab, doi:10.1139/apnm-2015-0235 |
| warm-up transition, cooling | McGowan CJ et al. 2015, Sports Med, doi:10.1007/s40279-015-0376-x |
| concurrent training: hypertrophy ES 0.85 vs 1.23; running, not cycling | Wilson JM et al. 2012, J Strength Cond Res, doi:10.1519/JSC.0b013e31823a3e2d |
| MCL layoff average 23 days (context only, not spoken) | Lundblad M et al. 2013, Br J Sports Med, doi:10.1136/bjsports-2013-092305 |

General anatomy (the ACL's function, shoulder stability structures, meniscus function, the lateral ankle mechanism) is textbook-level and labelled **general** in each episode's NOTES.

## Per-episode news sources
Listed under each episode in `afcon_injury_series.md` (section 9), with the «مش معروف» limitations.

## Unresolved / not verified
- S1: the injury date, the 40-day statement and Aboutrika's 2017 account are CARRIED from the v3 research file (Egyptian news sources), not re-fetched this session.
- S4: the date of Trezeguet's first first-team appearance after the injury isn't confirmed; the graft type isn't public.
- S5: whether it was his first dislocation, its direction, and the treatment aren't public.
- S6: the knee side conflicts between reports; a medial-ligament tear is reported by a single outlet (not spoken).
- S7: Zidan's diagnosis isn't public (bonus episode).
- None of the sports facts were checked against official CAF match sheets (not accessible); Wikipedia and match reports were used.
"""


def build_research():
    (V6 / "research_and_sources.md").write_text(RESEARCH, encoding="utf-8")


def build_review():
    pa_out, pa_tot = reg(V6 / "scripts" / "partA_final")
    se_out, se_tot = reg(V6 / "scripts" / "series_final", V6 / "content_system" / "tests" / "cases_series.json")
    v3_out, v3_tot = reg(ROOT / "scripts" / "v3_original")
    lp = lint.lint_collection(PA)[0]
    ls = lint.lint_collection(SE)[0]
    L = ["# editorial_review.md: Part D quality review", "",
         "Scores use the 10×10 rubric (`content_system/guides/rubric.md`). They're **editorial diagnostics by one editor (Claude), not predictions of reach or retention.** v3 = your PDF; v5 = the previous delivery; v6 = this one. \"Shared words\" is measured (word-level similarity of the spoken text).", "",
         "## Part A: the 12 original scripts", "",
         "| ID | v3 | v5 | v6 | shared words v3↔v6 | shared v5↔v6 | what changed in v6 |", "|---|---|---|---|---|---|---|"]
    t3 = t5 = t6 = 0
    for s in PA:
        sid = s["meta"]["id"]
        v3 = SC5[sid]["v3_total"]; v5 = SC5[sid]["v5_total"]; v6 = sum(SC6["partA"][sid]["v6"])
        t3 += v3; t5 += v5; t6 += v6
        L.append(f"| {sid} | {v3} | {v5} | **{v6}** | {sim(spoken_text(O[sid]), spoken_text(s)):.0%} | {sim(spoken_text(V5[sid]), spoken_text(s)):.0%} | {SC6['partA'][sid]['why']} |")
    n = len(PA)
    L += [f"| **avg** | {t3/n:.1f} | {t5/n:.1f} | **{t6/n:.1f}** | | | |", "",
          "**Honest note on the «مالوش لازمة» episodes:** v6 keeps the v5 text for the four ≤25 s series episodes (EP1, EP2, EP3, EP5). v5 had already rebuilt them from v3 (they share 31–55% of words with the original, and they carry the two science corrections), and I didn't find a change that made them better within the 25-second limit. Each is still substantively different from the PDF version.", "",
          "## Part B: the injury series (new)", "", "| Ep | score | [SCI] lines | first [SCI] position | what the viewer learns |", "|---|---|---|---|---|"]
    for s in SE:
        sid = s["meta"]["id"]
        blocks = spoken_blocks(s)
        idx = [i for i, (t, _) in enumerate(blocks) if t == "SCI"]
        L.append(f"| {sid} | {sum(SC6['series'][sid]['v6'])} | {len(idx)} | beat {min(idx)+1} of {len(blocks)} | {SC6['series'][sid]['learn']} |")
    L += ["", "**Final quality-gate question for every episode:** *If the viewer watches to the end, will they learn something meaningful about this specific injury or a rehab principle, as well as the story?* Answered in the last column. Every episode has at least two science beats (S7 has one plus a trial), and the first one comes in the first half; the regression suite enforces both.", "",
          "## The central fix to the AFCON concept", "",
          "- **Before (v3):** 3 stories (Aboutrika, Zidan, Gedo). The injury was background, and the science, if any, was one line near the end (EP02: «الكاحل كده بيرجع للكورة…»). Gedo had no injury.",
          "- **v5:** better storytelling, but the same problem: the science was a 1–2 line bridge.",
          "- **v6:** 7 episodes, 7 players, 7 injury types (stress fracture · hamstring tear · suspected concussion · ACL · shoulder dislocation · meniscus · ankle). The injury *is* the episode. The story introduces the injury, the `[SCI]` beats explain it in the middle, and the ending turns it into one thing the viewer can do or check.", "",
          "## Representative before → after", "",
          f"> **v3 EP01 (science):** {' '.join(x for t, x in spoken_blocks(O['EP01']) if 'العضمة' in x)}", ">",
          f"> **v6 S1 (science):** {' / '.join(x for t, x in spoken_blocks(SE[0]) if t == 'SCI')}", "",
          f"> **v3 GEDO (body):** {' '.join(x for t, x in spoken_blocks(O['GEDO']) if t in ('LINE',))}", ">",
          f"> **v6 GEDO (body):** {' '.join(x for t, x in spoken_blocks(next(p for p in PA if p['meta']['id']=='GEDO')) if t in ('SCI','MID'))}", "",
          "## Checks actually run", "",
          f"- Lint (Part A): {sum(i['level']=='FAIL' for i in lp)} FAIL, {sum(i['level']=='WARN' for i in lp)} WARN · Lint (series): {sum(i['level']=='FAIL' for i in ls)} FAIL, {sum(i['level']=='WARN' for i in ls)} WARN",
          f"- Regression, Part A: {pa_tot} · Series: {se_tot} · Original PDF on the Part A suite: {v3_tot}",
          "- Integrity: every spoken line of every final file appears verbatim in the deliverables; the original archive passes the word-level cross-check against the PDF text layer (`../tools/verify_integrity.py`).", "",
          "## Failures caught and fixed during this pass", "",
          "- Series draft 1 ran 75–112 s; compressed to 60–80 s without dropping a science beat.",
          "- S3 (Mané): all the science sat after the story (the regression suite flagged it); an early science beat was moved next to the head clash.",
          "- EP01/S1: «كسور المشط الخامس» could make listeners assume Aboutrika's fifth metatarsal (not public); reworded to «نوع من كسور المشط», with MT-5 on screen.",
          "- S1: the Omdurman stakes had lost their payoff after compression; the 4–0 over Algeria was restored.",
          "- Part A: adding science pushed 5 fitness scripts over their old targets; retargeted to 40–55 s and trimmed.", "",
          "## Limitations", "- See `research_and_sources.md` → Unresolved. Durations are estimates. No audience data was available or claimed."]
    (V6 / "editorial_review.md").write_text("\n".join(L), encoding="utf-8")


def card(s, b):
    m = s["meta"]
    b.append(f"<div class='card'><h3>{m['id']} · {html.escape(m['title'])}</h3><div class='sub'>{html.escape(m.get('title_en',''))} · {html.escape(m.get('format',''))}</div>"
             f"<div class='meta'>{('الإصابة: ' + html.escape(m['injury']) + ' · ') if m.get('injury') else ''}المدة التقديرية: {est(s)} · {len(words(spoken_text(s)))} كلمة</div><div class='spoken'>")
    for tag, text in s["blocks"]:
        t = f"<span class='tag'>{LABEL[tag]}</span>" if LABEL[tag] else ""
        b.append(f"<p class='l {tag}'>{t}{html.escape(text)}</p>")
    b.append("</div><div class='notes'>")
    if s["production"]:
        b.append("<b>على الشاشة / تصوير</b><ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in s["production"]) + "</ul>")
    if s["sources"]:
        b.append("<b>المصادر</b><div class='src'>" + "<br>".join(html.escape(x) for x in s["sources"]) + "</div>")
    b.append("</div></div>")


def build_html():
    v5h = (ROOT / "v5" / "rewritten_scripts.html").read_text(encoding="utf-8")
    css = re.search(r"<style>(.*)</style>", v5h, re.S).group(1)
    css = css.replace("page-break-inside:avoid;", "")
    css += ".SCI .tag{background:#7a3e9d}.SCI{border-right:3px solid #7a3e9d;padding-right:8px}"
    b = ["<h1>سكريبتات الريلز · v6</h1>", "<p class='meta'>@hazemmohamed.rehab · الجزء أ: كل سكريبتات الـ PDF · الجزء ب: سلسلة الإصابات (7 حلقات) · المدد تقديرية. «علم» = سطور الشرح العلمي.</p>",
         "<table class='toc'><tr><th>ID</th><th>العنوان</th><th>المدة التقديرية</th></tr>"]
    for s in SE + PA:
        b.append(f"<tr><td>{s['meta']['id']}</td><td>{html.escape(s['meta']['title'])}</td><td>{est(s)}</td></tr>")
    b.append("</table><h2>الجزء ب · سلسلة الإصابات — 7 لاعيبة، 7 إصابات</h2>")
    for s in SE:
        card(s, b)
    b.append("<h2>الجزء أ · سكريبتات الـ PDF بعد إعادة الكتابة</h2>")
    for s in PA:
        if s["meta"]["id"] in ("EP01", "EP02"):
            continue
        card(s, b)
    b.append("<p class='meta'>EP01 = S1 · EP02 = S7 (نفس النص).</p>")
    (V6 / "final_scripts.html").write_text(f"<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>سكريبتات v6</title><style>{css}</style></head><body>{''.join(b)}</body></html>", encoding="utf-8")


if __name__ == "__main__":
    build_original(); build_partA(); build_series(); build_research(); build_review(); build_html()
    print("built v6 deliverables")
