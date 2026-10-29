"""Build the v5 deliverables from the script files (run from the v5/ folder).

  python3 -I content_system/tools/build_v5.py
"""
import difflib
import re
import html
import json
import subprocess
import sys
from pathlib import Path

V5 = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(V5 / "content_system" / "tools"))
from scriptlib import load_dir, spoken_blocks, spoken_text, words, estimate_seconds  # noqa: E402
import lint_scripts as lint  # noqa: E402

ORIG = load_dir(V5.parent / "scripts" / "v3_original")
V4 = {s["meta"]["id"]: s for s in load_dir(V5.parent / "scripts" / "v4_final")}
FINAL = load_dir(V5 / "scripts" / "v5_final")
SC = json.loads((V5 / "evaluation" / "scores_v5.json").read_text(encoding="utf-8"))
DIAG = {}
for block in (V5 / "evaluation" / "diagnostics_source.md").read_text(encoding="utf-8").split("\n## ")[0:]:
    block = block.lstrip("# ").strip()
    if block:
        head, _, body = block.partition("\n")
        DIAG[head.strip()] = body.strip()
LABEL = {"HOOK": "الهوك", "LINE": "", "MID": "هوك النص", "END": "الختام", "CTA": "CTA", "ALT": "بديل (مش بيتقال)"}
CAT = {"approved": "fitness/rehab · educational", "story": "AFCON · storytelling", "maloosh": "series «مالوش لازمة» · educational (≤25 s)"}
SEC = {"approved": "1 · الريلز الخمسة المعتمدة", "story": "2 · حكاية إصابة · جيل الذهب", "maloosh": "3 · مالوش لازمة"}
PAGES = {"A1": 3, "B1": 4, "A2": 5, "B2": 6, "B3": 7, "EP01": 9, "EP02": 10, "GEDO": 11, "EP1": 13, "EP2": 14, "EP3": 15, "EP5": 16}
DN = {"opening": "Opening", "coherence": "Coherence", "progression": "Progression", "middle_hook": "Middle hook", "egyptian": "Egyptian Arabic",
      "originality": "Originality", "concision": "Concision & pacing", "payoff": "Payoff & value", "integrity": "Integrity", "spoken": "Spoken delivery"}
OPEN_ISSUES = {
    "A1": "No how-to for the Nordic (a candidate follow-up reel). Estimate at the top of the target.",
    "B1": "No numeric return-to-sport benchmark. Stating one (e.g. ≥90% of the healthy side, from ACL research) is Hazem's decision.",
    "A2": "The wall stance is an observation, not a validated test (stated on screen).",
    "B2": "The pain-score threshold is omitted on purpose (secondary sources conflict on 5/10).",
    "B3": "Using the MDC for side-to-side differences is an approximation (noted).",
    "EP01": "The injury date, the 40-day statement and his 2017 account are CARRIED from the v3 research (news sources, not re-verified this session). Estimate 54–66 s, above v3's 45–55 s story target.",
    "EP02": "The 2006 choice, «لسه مش عارف» and the substitution minutes are CARRIED; the 59' in the final comes from a single source, so it's spoken as «لحد قرب الساعة».",
    "GEDO": "Minutes total differs (168 vs 173); spoken as «أقل من ماتشين». The «Super Sub» source is CARRIED.",
    "EP1": "'Useless' is the series' deliberate exaggeration, qualified in the next line; the list format caps progression.",
    "EP2": "None open.", "EP3": "None open.",
    "EP5": "«عجلة أكتر، وجري أقصر» is an applied principle derived from the meta-analysis's moderators, for a muscle-gain goal only.",
}


def sim(a, b):
    return difflib.SequenceMatcher(None, words(a), words(b), autojunk=False).ratio()


def est(s):
    lo, hi = estimate_seconds(len(words(spoken_text(s))))
    return f"من {lo} لـ {hi} ث"


def spoken_md(s):
    out = []
    for tag, text in s["blocks"]:
        lab = LABEL[tag]
        out.append(f"- **{lab}** {text}" if lab else f"- {text}")
    return "\n".join(out)


def extras_md(s):
    out = []
    for title, key in (("على الشاشة / تصوير", "production"), ("ملاحظات (مؤكد / ممنوع يتقال / مش بنقول)", "notes"), ("المصادر (للمراجعة — مش للكلام)", "sources")):
        if s[key]:
            out.append(f"\n**{title}**")
            out += [f"- {x}" for x in s[key]]
    return "\n".join(out)


issues_by_id = {}
lint_issues, lint_table = lint.lint_collection(FINAL)
for i in lint_issues:
    issues_by_id.setdefault(i["id"], []).append(i)
reg = subprocess.run([sys.executable, "-I", str(V5 / "content_system" / "tests" / "run_regression.py"), str(V5 / "scripts" / "v5_final")], capture_output=True, text=True).stdout
reg_status = {line.split()[1]: line.split()[0] for line in reg.splitlines() if line[:4] in ("PASS", "FAIL")}
reg_total = reg.strip().splitlines()[-1]
O = {s["meta"]["id"]: s for s in ORIG}


def meets(sid):
    r = SC["scripts"][sid]
    return r["v5_total"] >= 75 and r["v5"]["integrity"] >= 8 and min(r["v5"].values()) >= 6 and not any(i["level"] == "FAIL" for i in issues_by_id.get(sid, [])) and reg_status.get(sid) == "PASS"


def quality_line(s):
    sid = s["meta"]["id"]
    r = SC["scripts"][sid]
    return (f"**G. Quality review:** score v3 {r['v3_total']} → v4 {r['v4_total']} → **v5 {r['v5_total']}** / 100 · "
            f"est. {est(s)} (target {s['meta']['target']} s) · lint {'0 FAIL' if not any(i['level']=='FAIL' for i in issues_by_id.get(sid, [])) else 'FAIL'} · "
            f"regression {reg_status.get(sid, '?')} · words shared with v3: {sim(spoken_text(O[sid]), spoken_text(s)):.0%} · "
            f"**{'meets the bar' if meets(sid) else 'below the bar'}** · Open: {OPEN_ISSUES[sid]}")


def build_original():
    arch = (V5.parent / "source" / "ORIGINAL_SCRIPTS.md").read_text(encoding="utf-8")
    inv = ["# original_scripts.md: complete archive of Round 1 v3 (verbatim)", "",
           "Source PDF: `../source/Reel_Scripts_Round1_v3_original.pdf` (unchanged copy of the upload; SHA-256 `832df714af670707453c6f5cef47b4a153c239f175a465a100266b5ecbd56a01`). Every page was inspected as an image; the transcription is cross-checked word by word against the PDF text layer by `../tools/verify_integrity.py` (PASS).", "",
           "## Inventory", "", "| # | ID | Original title | Category | Format | PDF page | Spoken words |", "|---|---|---|---|---|---|---|"]
    for i, s in enumerate(ORIG, 1):
        m = s["meta"]
        inv.append(f"| {i} | {m['id']} | {m['title']} | {CAT[m['series']]} | {m.get('format','')} | {PAGES[m['id']]} | {len(words(spoken_text(s)))} |")
    inv += ["| — | EP4 | برنامج الوقاية مالوش لازمة! | series | placeholder, no text («مستني مصدر») | 17 | 0 |",
            "| — | A3 | متابعة الرباط الصليبي | educational | placeholder, no text (deferred) | 17 | 0 |", "",
            "12 written scripts + 2 placeholders without text. Pages 1, 2, 8 and 12 are the cover, how-to-read page and section dividers (reproduced below).", "", "---", ""]
    body = arch.split("## Front matter", 1)[1]
    (V5 / "original_scripts.md").write_text("\n".join(inv) + "## Front matter" + body, encoding="utf-8")


def build_rewritten():
    L = ["# rewritten_scripts.md: Round 1, v5 (recording-ready)", "",
         "Same order as the PDF. Only lines after **الهوك / هوك النص / الختام / CTA** (and untagged lines) are spoken. «بديل» isn't spoken (A/B option). Durations are **estimates** (≈1.95 words/s, calibrated to the PDF's own syllable estimates). Read each script 3× with a stopwatch and use the median.", ""]
    cur = None
    for s in FINAL:
        m = s["meta"]
        if m["series"] != cur:
            cur = m["series"]
            L += [f"## {SEC[cur]}", ""]
        L += [f"### {m['id']} · {m['title']}", f"*A. Original title:* {O[m['id']]['meta']['title']} · *Category:* {CAT[m['series']]} · *Structure:* {m.get('structure','')} · *Estimate:* {est(s)} · {len(words(spoken_text(s)))} words", "",
              "**E. Final script**", "", spoken_md(s), extras_md(s), "", quality_line(s), "", "---", ""]
    L += ["## Not written (no text in the PDF)", "- **EP4 «برنامج الوقاية مالوش لازمة!»**: still waiting for the adherence/dose source you planned.", "- **A3 «متابعة الرباط الصليبي»**: deferred in your plan.", ""]
    (V5 / "rewritten_scripts.md").write_text("\n".join(L), encoding="utf-8")


def build_diagnostics():
    L = ["# script_diagnostics.md: diagnoses and key editorial decisions", "",
         "Per script: **A** original title · **B** original opening (full text in `original_scripts.md`) · **C** diagnosis with the exact passages · **D** new angle · **F** key decisions · **G** quality review. **E** (the final script) is in `rewritten_scripts.md`.", ""]
    for s in FINAL:
        sid = s["meta"]["id"]
        o = O[sid]
        first = next(t for tag, t in spoken_blocks(o) if tag == "HOOK")
        L += [f"## {sid}", "", f"**A.** {o['meta']['title']} ({CAT[o['meta']['series']]})", "", f"**B. Original opening:** «{first}»", "",
              re.sub(r"^### (.+)$", r"\n**\1**\n", DIAG[sid], flags=re.M),
              "", quality_line(s), "", "---", ""]
    (V5 / "script_diagnostics.md").write_text("\n".join(L), encoding="utf-8")


def passage(s, tags):
    return " ".join(t for tag, t in spoken_blocks(s) if tag in tags)


def build_evaluation():
    rows, n = [], len(FINAL)
    for s in FINAL:
        sid = s["meta"]["id"]
        r = SC["scripts"][sid]
        rows.append(f"| {sid} | {CAT[s['meta']['series']].split(' ·')[0]} | {r['v3_total']} | {r['v4_total']} | **{r['v5_total']}** | +{r['v5_total']-r['v3_total']} | {sim(spoken_text(O[sid]), spoken_text(V4[sid])):.0%} | {sim(spoken_text(O[sid]), spoken_text(s)):.0%} | {est(O[sid])} → {est(s)} | {'yes' if meets(sid) else '**no**'} |")
    avg = lambda v: sum(SC["scripts"][s["meta"]["id"]][v + "_total"] for s in FINAL) / n
    met = sum(meets(s["meta"]["id"]) for s in FINAL)
    def lint_counts(d):
        iss, tab = lint.lint_collection(load_dir(d))
        return (sum(i["level"] == "FAIL" for i in iss), sum(i["level"] == "WARN" for i in iss), sum(r["contrast_reveal"] for r in tab), sum(r.get("colons", 0) for r in tab), sum(r["spoken_disclaimers"] for r in tab), sum(1 for r in tab if r["generic_referral"]))
    lc = {k: lint_counts(d) for k, d in (("v3", V5.parent / "scripts" / "v3_original"), ("v4", V5.parent / "scripts" / "v4_final"), ("v5", V5 / "scripts" / "v5_final"))}
    regs = {}
    for k, d in (("v3", V5.parent / "scripts" / "v3_original"), ("v4", V5.parent / "scripts" / "v4_final"), ("v5", V5 / "scripts" / "v5_final")):
        out = subprocess.run([sys.executable, "-I", str(V5 / "content_system" / "tests" / "run_regression.py"), str(d)], capture_output=True, text=True).stdout
        regs[k] = out.strip().splitlines()[-1]
    L = ["# before_after_evaluation.md", "",
         "**What these numbers are:** one editor (Claude) scored v3 (your PDF), v4 (the previous attempt) and v5 (this rewrite) with the same 10×10 rubric (`content_system/guides/rubric.md`) in one sitting. They're **editorial diagnostics, not predictions of reach, retention or virality.** The \"words shared with v3\" column is measured, not judged: word-level sequence similarity of the spoken text.", "",
         "## Summary", "", "| ID | Category | v3 | v4 | v5 | Δ v3→v5 | words shared v3↔v4 | words shared v3↔v5 | estimate v3 → v5 | meets bar |", "|---|---|---|---|---|---|---|---|---|---|", *rows,
         f"| **avg** | | {avg('v3'):.1f} | {avg('v4'):.1f} | **{avg('v5'):.1f}** | +{avg('v5')-avg('v3'):.1f} | | | | {met}/{n} |", "",
         "Bar: total ≥75, integrity ≥8, no dimension below 6, lint 0 FAIL, regression PASS.", "",
         "**Why the previous attempt didn't feel different:** v4's EP01 kept **82%** of v3's spoken words, and EP02 kept 62%. The v4 system protected strong lines, and that rule ended up preserving the weak structure around them. In v5, EP01 shares 37% and EP02 21%. Those stories were rebuilt from the verified facts (`afcon_storytelling_guide.md`).", "",
         "## Automated checks (reproducible)", "", "| | v3 | v4 | v5 |", "|---|---|---|---|",
         f"| lint FAIL / WARN | {lc['v3'][0]} / {lc['v3'][1]} | {lc['v4'][0]} / {lc['v4'][1]} | {lc['v5'][0]} / {lc['v5'][1]} |",
         f"| «مش X… Y» contrast reveals | {lc['v3'][2]} | {lc['v4'][2]} | {lc['v5'][2]} |",
         f"| «X: Y» colons in speech | {lc['v3'][3]} | {lc['v4'][3]} | {lc['v5'][3]} |",
         f"| spoken disclaimers | {lc['v3'][4]} | {lc['v4'][4]} | {lc['v5'][4]} |",
         f"| generic referral endings | {lc['v3'][5]} | {lc['v4'][5]} | {lc['v5'][5]} |",
         f"| v5 regression suite | {regs['v3']} | {regs['v4']} | {regs['v5']} |", "",
         "Some regression cases encode v5 decisions (for example, the EP02 hook mustn't contain the payoff), so earlier versions failing them isn't independent evidence. The independent signals are length, contrast and colon counts, disclaimers, referral endings, clichés and duplicated conditions.", "",
         "## Representative before / after passages", ""]
    for sid, tags, note in (("EP01", ("HOOK",), "Opening: ambiguity and a contrast → a paradox plus a held question"),
                            ("EP01", ("END",), "Ending: summary → insight"),
                            ("EP02", ("HOOK",), "Opening: whole setup → a debt the story repays"),
                            ("EP02", ("LINE",), "Middle: accounts and minutes → a setback, then the rematch"),
                            ("GEDO", ("LINE",), "Body: stat fragments and arguing with no one → who he was, then escalation"),
                            ("B1", ("HOOK", "END"), "Educational: vague gap and a categories list → a lived scene and a decision rule"),
                            ("EP5", ("LINE", "MID"), "Series: claim contradicting its source → correct claim plus a twist")):
        o, f = O[sid], next(x for x in FINAL if x["meta"]["id"] == sid)
        L += [f"### {sid}: {note}", "", f"> **v3:** {passage(o, tags)}", ">", f"> **v5:** {passage(f, tags)}", ""]
    L += ["## Per-script scores and justifications", ""]
    for s in FINAL:
        sid = s["meta"]["id"]
        r = SC["scripts"][sid]
        L += [f"### {sid} · {s['meta']['title']}  (v3 {r['v3_total']} → v4 {r['v4_total']} → v5 {r['v5_total']})", "", f"v4 note: {r['note_v4']}", "",
              "| Dimension | v3 | v4 | v5 | Why (v3 → v5) |", "|---|---|---|---|---|"]
        for d in SC["dimensions"]:
            a, b, c = r["v3"][d], r["v4"][d], r["v5"][d]
            flag = "" if c > a else " ⚠ not improved"
            L.append(f"| {DN[d]} | {a} | {b} | {c}{flag} | v3: {r['why_v3'][d]}<br>v5: {r['why_v5'][d]} |")
        L += [""]
    (V5 / "before_after_evaluation.md").write_text("\n".join(L), encoding="utf-8")


def build_html():
    fonts = "../deliverables/assets/fonts/"
    css = f"""
@font-face {{ font-family:'Noto Naskh Arabic'; src:url('{fonts}noto-naskh-arabic-arabic-400-normal.woff2') format('woff2'); font-weight:400; unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E; }}
@font-face {{ font-family:'Noto Naskh Arabic'; src:url('{fonts}noto-naskh-arabic-arabic-700-normal.woff2') format('woff2'); font-weight:700; unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E; }}
body {{ font-family:'Noto Naskh Arabic','Inter','DejaVu Sans',sans-serif; direction:rtl; color:#1b1f24; line-height:1.9; font-size:12.5pt; }}
h1 {{ font-size:22pt; margin:0 0 4px; }} h2 {{ font-size:15pt; margin:24px 0 8px; border-bottom:2px solid #1b1f24; padding-bottom:4px; break-before:page; }}
h2 + .card {{ break-before:auto; }}
.meta {{ color:#5b6470; font-size:10pt; }}
.card {{ break-before:page; page-break-inside:avoid; border:1px solid #d7dce2; border-radius:8px; padding:12px 16px; margin:14px 0; }}
.card h3 {{ margin:0; font-size:14pt; }} .sub {{ color:#5b6470; font-size:9.5pt; direction:ltr; text-align:right; }}
.spoken {{ background:#f4f6f8; border-radius:6px; padding:8px 14px; margin:10px 0; }}
.l {{ margin:6px 0; font-size:13.5pt; }} .tag {{ display:inline-block; font-size:8.5pt; color:#fff; border-radius:4px; padding:0 6px; margin-left:6px; }}
.HOOK .tag{{background:#0f7b5f}}.MID .tag{{background:#b25d00}}.END .tag{{background:#2747a8}}.CTA .tag{{background:#6b4fa0}}.ALT{{color:#8a929c;font-size:11pt}}.ALT .tag{{background:#8a929c}}
.HOOK{{border-right:3px solid #0f7b5f;padding-right:8px}}.MID{{border-right:3px solid #b25d00;padding-right:8px}}.END{{border-right:3px solid #2747a8;padding-right:8px}}
.notes {{ font-size:8.8pt; line-height:1.6; color:#39414a; }} .notes ul {{ margin:2px 0 6px; padding-right:18px; }} .src {{ direction:ltr; text-align:left; font-family:'Inter','DejaVu Sans',sans-serif; font-size:8.5pt; color:#2747a8; }}
table.toc {{ width:100%; border-collapse:collapse; font-size:11pt; margin-top:14px; }} .toc td,.toc th {{ border-bottom:1px solid #e3e7eb; padding:5px 6px; text-align:right; }} .toc th {{ color:#5b6470; }}
"""
    b = ["<h1>سكريبتات الريلز — الجولة الأولى · v5</h1>",
         "<p class='meta'>@hazemmohamed.rehab · نفس ترتيب الـ PDF · المدد تقديرية (≈1.95 كلمة/ثانية) — اقرا كل سكريبت 3 مرات بستوب ووتش وخد الوسيط. الكلام اللي في الصندوق بس هو اللي بيتقال.</p>",
         "<table class='toc'><tr><th>ID</th><th>العنوان</th><th>القسم</th><th>المدة التقديرية</th></tr>"]
    for s in FINAL:
        m = s["meta"]
        b.append(f"<tr><td>{m['id']}</td><td>{html.escape(m['title'])}</td><td>{html.escape(SEC[m['series']].split(' · ',1)[1])}</td><td>{est(s)}</td></tr>")
    b.append("<tr><td>EP4 · A3</td><td colspan='3'>لسه محتاجة بحث — مش مكتوبة (زي الـ PDF)</td></tr></table>")
    cur = None
    for s in FINAL:
        m = s["meta"]
        if m["series"] != cur:
            cur = m["series"]
            b.append(f"<h2>{html.escape(SEC[cur])}</h2>")
        b.append(f"<div class='card'><h3>{m['id']} · {html.escape(m['title'])}</h3><div class='sub'>{html.escape(m.get('title_en',''))} · {html.escape(m.get('format',''))}</div>"
                 f"<div class='meta'>المدة التقديرية: {est(s)} · {len(words(spoken_text(s)))} كلمة · الهدف {m['target'].replace('-', ' لـ ')} ث</div><div class='spoken'>")
        for tag, text in s["blocks"]:
            t = f"<span class='tag'>{LABEL[tag]}</span>" if LABEL[tag] else ""
            b.append(f"<p class='l {tag}'>{t}{html.escape(text)}</p>")
        b.append("</div><div class='notes'>")
        for title, key in (("على الشاشة / تصوير", "production"), ("ملاحظات", "notes")):
            if s[key]:
                b.append(f"<b>{title}</b><ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in s[key]) + "</ul>")
        if s["sources"]:
            b.append("<b>المصادر (للمراجعة — مش للكلام)</b><div class='src'>" + "<br>".join(html.escape(x) for x in s["sources"]) + "</div>")
        b.append("</div></div>")
    doc = f"<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>سكريبتات الريلز v5</title><style>{css}</style></head><body>{''.join(b)}</body></html>"
    (V5 / "rewritten_scripts.html").write_text(doc, encoding="utf-8")


if __name__ == "__main__":
    build_original(); build_rewritten(); build_diagnostics(); build_evaluation(); build_html()
    print("built original_scripts.md, rewritten_scripts.md, script_diagnostics.md, before_after_evaluation.md, rewritten_scripts.html")
    print("regression:", reg_total)
