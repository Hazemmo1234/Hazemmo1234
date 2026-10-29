"""Build deliverables from the script files.

  python3 -I tools/build_collection.py
    -> source/ORIGINAL_SCRIPTS.md          (C, verbatim archive of the v3 PDF)
    -> deliverables/REWRITTEN_SCRIPTS.md   (D, final collection, original order)
    -> deliverables/BEFORE_AFTER_REPORT.md (E)
    -> deliverables/REWRITTEN_SCRIPTS.html (input for tools/render_pdf.js)
"""
import hashlib
import html
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scriptlib import ROOT, load_dir, spoken_blocks, spoken_text, words, estimate_seconds  # noqa: E402

ORIG = load_dir(ROOT / "scripts" / "v3_original")
FINAL = load_dir(ROOT / "scripts" / "v4_final")
PASS1 = {s["meta"]["id"]: s for s in load_dir(ROOT / "scripts" / "v4_pass1")}
SCORES = json.loads((ROOT / "evaluation" / "scores.json").read_text(encoding="utf-8"))
LINT = {v: json.loads((ROOT / "evaluation" / f"lint_{v}.json").read_text(encoding="utf-8")) for v in ("v3_original", "v4_pass1", "v4_final")}
PDF = ROOT / "source" / "Reel_Scripts_Round1_v3_original.pdf"
LABEL = {"HOOK": "الهوك", "LINE": "", "MID": "هوك النص", "END": "الختام", "CTA": "CTA", "ALT": "بديل (مش بيتقال)"}
SERIES = {"approved": "1 · الريلز الخمسة المعتمدة", "story": "2 · حكاية إصابة · جيل الذهب", "maloosh": "3 · مالوش لازمة"}

FRONT_MATTER = """\
> @hazemmohamed.rehab · سكريبتات جاهزة للتصوير · النسخة 3 (حكايات أعمق)
>
> # سكريبتات الريلز — الجولة الأولى · v3
> الريلز الخمسة المعتمدة · حكاية إصابة · مالوش لازمة
>
> **إزاي تقرا الصفحة** — الهوك: أول جملة — أول 1–3 ثواني. · هوك النص: الجملة اللي بتجدد الانتباه في النص. · الختام: الإجابة أو الفكرة اللي الريل بيقفل عليها. · اللي جوه الصندوق الكبير بس هو الكلام اللي بيتقال. الملاحظات والمصادر برّه الصندوق.
>
> **المدة** — كل المدد تقديرية — ماحدش سجّل صوت. محسوبة بعدد المقاطع الصوتية التقريبي (معايَر على العدّ اليدوي في ملف البحث)، بسرعة 4–5 مقاطع في الثانية، زائد وقفات قصيرة. الحكم النهائي: اقرا السكريبت بصوتك الطبيعي 3 مرات بستوب ووتش وخد الوسيط. «مالوش لازمة» لازم يطلع 25 ثانية أو أقل.
>
> **الترتيب** — الخمسة المعتمدين بنفس الترتيب: A1 ← B1 ← A2 ← B2 ← B3. A3 لسه مؤجل. الخطة والقياس زي ما هم.
>
> **الصوت** — مفيش تسجيلات أو ترانسكريبت لكلامك متاحة، فالأسلوب هنا مبني على مبادئ المصري المنطوق، مش تقليد لطريقتك انت. لو كلمة مش بتاعتك، غيّرها وانت بتقرا.
>
> **قسم 1 · الريلز الخمسة المعتمدة** — بنفس الترتيب المعتمد: A1 ← B1 ← A2 ← B2 ← B3. المعنى العلمي والتجربة زي ما هم؛ الكلام نفسه اتعاد كتابته عشان يتقال، مش يتقري.
>
> **قسم 2 · حكاية إصابة · جيل الذهب** — حكايات كاملة: السياق، اللي حصل، اللي بعده، والفكرة العلمية اللي طالعة من الحكاية نفسها. مفيش دراسات في الكلام — المصادر تحت للمراجعة بس. المدة المستهدفة 45–55 ثانية. قصة جدو مرافقة اختيارية.
>
> **قسم 3 · مالوش لازمة** — 4 حلقات جاهزة. كل سطر فيه «مالوش لازمة» وبيضيف شرط مختلف. الحلقة 4 مستنية مصدر.
"""

PLACEHOLDERS = """\
## لسه محتاجة بحث — NOT READY — REQUIRES RESEARCH (صفحة 17)

- **EP4 — برنامج الوقاية مالوش لازمة!** — مستني مصدر متراجع عن الالتزام بالبرنامج أو جرعته. السطور مش هتتكتب من غيره.
- **A3 — متابعة الرباط الصليبي** — مؤجل زي ما هو في الخطة، ومش متفقّل.
- المصدر: Soligard et al. 2008 — BMJ

These two entries have **no script text** in the PDF, so there is nothing to rewrite. They
are listed in the inventory as unwritten and were not drafted (see the report: drafting them
needs Hazem's research decision, not a rewrite).
"""


def md_script(s, with_meta=True):
    out = [f"### {s['meta']['id']} · {s['meta']['title']}",
           f"*{s['meta'].get('title_en','')}* · {s['meta'].get('format','')}"]
    if s["meta"].get("stated_estimate"):
        out.append(f"المدة التقديرية في الـ PDF: {s['meta']['stated_estimate']}")
    out.append("")
    for tag, text in s["blocks"]:
        lab = LABEL[tag]
        out.append(f"- **{lab}** {text}" if lab else f"- {text}")
    for title, key in (("على الشاشة / تصوير", "production"), ("ملاحظات", "notes"), ("المصادر (للمراجعة — مش للكلام)", "sources")):
        if s[key]:
            out.append(f"\n**{title}**")
            out += [f"- {x}" for x in s[key]]
    return "\n".join(out) + "\n"


def build_archive():
    sha = hashlib.sha256(PDF.read_bytes()).hexdigest()
    lines = [
        "# Original script archive: Round 1 v3 (verbatim)",
        "",
        "Source: `source/Reel_Scripts_Round1_v3_original.pdf` (an unmodified copy of the uploaded file, 17 pages, A4).",
        f"SHA-256: `{sha}`. Matches the uploaded file; the upload itself was not modified.",
        "",
        "## How this was extracted",
        "- All 17 pages were inspected as **page images**, and every script was transcribed from the images.",
        "- `pdftotext` was used as a cross-check only. It breaks the Arabic lam-alef ligature (it outputs «الزمة» for «لازمة» and «األولى» for «الأولى») and reorders mixed RTL/LTR runs, so its raw output is **not** used as the archive text.",
        "- Ambiguous spots were resolved against the image and the text layer together: the EP02 timeline order and the ellipsis character «…».",
        "- Original typo/register kept verbatim: B1's ending «فإن الوجع راح» (flagged in the diagnosis, not corrected here).",
        "- **Corrections found by the automated cross-check** (`tools/verify_integrity.py`, archive word vs PDF text layer): B3 «بيتني» (I had first misread it from the image as «بيثني») and EP01 note «مايضموش» (first transcribed as «مايضمهوش»). Both are now verbatim. Remaining mismatches are pdftotext artefacts: shadda/fatha word splits and LTR/RTL reordering of «يوم7»، «+60»، and English source fragments.",
        "",
        "## Inventory (stable IDs, original order)",
        "",
        "| # | ID | Section | Title | PDF page | Spoken words | PDF's own estimate |",
        "|---|---|---|---|---|---|---|",
    ]
    pages = {"A1": 3, "B1": 4, "A2": 5, "B2": 6, "B3": 7, "EP01": 9, "EP02": 10, "GEDO": 11, "EP1": 13, "EP2": 14, "EP3": 15, "EP5": 16}
    for i, s in enumerate(ORIG, 1):
        sid = s["meta"]["id"]
        lines.append(f"| {i} | {sid} | {s['meta']['series']} | {s['meta']['title']} | {pages[sid]} | {len(words(spoken_text(s)))} | {s['meta'].get('stated_estimate','')} |")
    lines += ["| — | EP4 | maloosh | برنامج الوقاية مالوش لازمة! | 17 | no text | NOT READY |",
              "| — | A3 | approved | متابعة الرباط الصليبي | 17 | no text | deferred |",
              "", "Non-script pages: 1 (cover/contents/how to read), 2, 8 and 12 (section dividers).", "",
              "## Front matter (page 1 and section dividers, verbatim)", "", FRONT_MATTER, ""]
    current = None
    for s in ORIG:
        if s["meta"]["series"] != current:
            current = s["meta"]["series"]
            lines += [f"## {SERIES[current]}", ""]
        lines += [md_script(s), "---", ""]
    lines.append(PLACEHOLDERS)
    (ROOT / "source" / "ORIGINAL_SCRIPTS.md").write_text("\n".join(lines), encoding="utf-8")


def est(s):
    lo, hi = estimate_seconds(len(words(spoken_text(s))))
    return f"من {lo} لـ {hi} ث"


def build_collection():
    lines = ["# سكريبتات الريلز — الجولة الأولى · v4", "",
             "@hazemmohamed.rehab · نفس ترتيب v3 · كل المدد **تقديرية** (≈1.95 كلمة/ثانية، معايرة على تقديرات v3). اقرا كل سكريبت 3 مرات بستوب ووتش وخد الوسيط.",
             "", "اللي بعد **الهوك / هوك النص / الختام / CTA** بس هو اللي بيتقال. «بديل» مش بيتقال (للتجربة A/B). الملاحظات والمصادر للمراجعة.", ""]
    current = None
    for s in FINAL:
        if s["meta"]["series"] != current:
            current = s["meta"]["series"]
            lines += [f"## {SERIES[current]}", ""]
        lines.append(md_script(s).replace("\n\n", f"\n\nالمدة التقديرية (v4): {est(s)} · {len(words(spoken_text(s)))} كلمة\n\n", 1))
        lines += ["---", ""]
    lines += ["## لسه محتاجة بحث (زي v3)", "- **EP4 — برنامج الوقاية مالوش لازمة!** — مستني مصدر. ماتكتبش.", "- **A3 — متابعة الرباط الصليبي** — مؤجل.", ""]
    (ROOT / "deliverables" / "REWRITTEN_SCRIPTS.md").write_text("\n".join(lines), encoding="utf-8")


def lint_row(version, sid):
    return next(r for r in LINT[version]["table"] if r["id"] == sid)


def build_report():
    D = SCORES["dimensions"]
    names = {"hook": "Hook (15)", "narrative": "Narrative & middle hook (20)", "voice": "Egyptian voice (15)", "relevance": "Relevance (10)",
             "originality": "Originality (10)", "clarity": "Clarity & efficiency (10)", "practical": "Practical value (10)", "accuracy": "Accuracy (10)"}
    diag = (ROOT / "evaluation" / "diagnosis.md").read_text(encoding="utf-8")
    sections = {}
    for block in diag.split("\n## ")[1:]:
        head, _, body = block.partition("\n")
        sections[head.strip()] = body.strip()
    L = ["# Before / after report: Round 1 v3 → v4", "",
         "**Read this first.** Scores come from one editor (Claude) applying `system/RUBRIC.md` to all three versions in one sitting. They're editorial judgements, made visible so you can disagree with them line by line. **They don't predict Instagram retention, reach or saves.** Only your analytics can do that (see the testing plan in `EXECUTIVE_SUMMARY.md`). Durations are **estimates** from word counts, calibrated to v3's own syllable-based estimates. Nothing was recorded.",
         "", "## Summary", "",
         "| ID | v3 | pass 1 | final | Δ | v3 words → final | v3 est. → final est. | lint FAIL/WARN v3 → final | meets bar (≥80, accuracy ≥8, no Low band) |",
         "|---|---|---|---|---|---|---|---|---|"]
    tot = {"v3": 0, "pass1": 0, "final": 0}
    meets = 0
    for s in FINAL:
        sid = s["meta"]["id"]
        sc = SCORES["scripts"][sid]
        for v in tot:
            tot[v] += sc[v]["total"]
        o, f = lint_row("v3_original", sid), lint_row("v4_final", sid)
        def cnt(version):
            iss = [i for i in LINT[version]["issues"] if i["id"] == sid]
            return f"{sum(i['level']=='FAIL' for i in iss)}/{sum(i['level']=='WARN' for i in iss)}"
        fs = sc["final"]["scores"]
        low = any(fs[d] <= {"hook": 5, "narrative": 7, "voice": 5}.get(d, 3) for d in D)
        ok = sc["final"]["total"] >= 80 and fs["accuracy"] >= 8 and not low
        meets += ok
        L.append(f"| {sid} | {sc['v3']['total']} | {sc['pass1']['total']} | **{sc['final']['total']}** | +{sc['final']['total']-sc['v3']['total']} | {o['words']} → {f['words']} | {o['est_seconds']} → {f['est_seconds']} s | {cnt('v3_original')} → {cnt('v4_final')} | {'yes' if ok else '**no**'} |")
    n = len(FINAL)
    L += [f"| **avg** | {tot['v3']/n:.1f} | {tot['pass1']/n:.1f} | **{tot['final']/n:.1f}** | +{(tot['final']-tot['v3'])/n:.1f} | | | | {meets}/{n} |", "",
          f"**{meets} of {n} scripts meet the quality bar. {n-meets} sit at 78–79**, and each one's limiting factor is named below. For those four, further gains need a decision from Hazem (a format change, a benchmark choice, or cutting story detail), not more polishing.",
          "", "Automated checks (reproducible: `python3 -I tools/lint_scripts.py <dir>` and `python3 -I tests/run_regression.py <dir>`):", "",
          "| | v3 original | v4 pass 1 | v4 final |", "|---|---|---|---|"]
    for label, fn in (("lint FAIL", lambda v: sum(i["level"] == "FAIL" for i in LINT[v]["issues"])),
                      ("lint WARN", lambda v: sum(i["level"] == "WARN" for i in LINT[v]["issues"])),
                      ("«مش X… Y» reveals (total)", lambda v: sum(r["contrast_reveal"] for r in LINT[v]["table"])),
                      ("spoken disclaimers (total)", lambda v: sum(r["spoken_disclaimers"] for r in LINT[v]["table"])),
                      ("generic referral endings", lambda v: sum(1 for r in LINT[v]["table"] if r["generic_referral"]))):
        L.append(f"| {label} | {fn('v3_original')} | {fn('v4_pass1')} | {fn('v4_final')} |")
    reg = {v: (ROOT / "evaluation" / f"evaluation_{v}.txt").read_text(encoding="utf-8").strip().splitlines()[-1] for v in ("v3_original", "v4_pass1", "v4_final")}
    L.append(f"| regression suite | {reg['v3_original']} | {reg['v4_pass1']} | {reg['v4_final']} |")
    L += ["", "Note on the regression numbers: some assertions encode v4 decisions (for example, specific payoff keywords and corrected sentences), so v3 failing them is not independent evidence. The independent signals are the generic checks: length, contrast count, disclaimers, referral endings, MSA markers and duplicated conditions.", "",
          "## What pass 1 got wrong (and pass 2 fixed)", "",
          "- **Length:** pass 1 removed every contrast tic and disclaimer, but added content. 5 scripts went over target (A1 50–61 s vs 35–45). Pass 2 compressed without moving the targets.",
          "- **A repeated hook shape:** 4 of 5 approved reels opened with a question. A2 now opens on a number, and B3 on its original command.",
          "- **Excessive rewriting:** pass 1 replaced B3's hook, the strongest do-it-now line in the PDF. Pass 2 restored it, and the regression suite now protects it.",
          "- **A repeated ending shape:** A2's ending mirrored B1's (pain vs X). A2 now ends on a reframe question.",
          "- **Unspeakable lines** found on the read-aloud: «لووه» → «لواه»، «قدام» → «قصاد»; a double «بس» in EP5; the 40-day figure lost its source («الأهلي بيقول» restored).",
          "", "## Scientific corrections", "",
          "| ID | v3 | Problem | v4 | Source checked |", "|---|---|---|---|---|",
          "| EP5 | «مالوش لازمة لو هدفك عضل وقوة، وانت نازل جري كل يوم» | Says cardio is useless for muscle; the PDF's own note and the meta-analysis say gains are smaller, not zero | «عضلهم زاد… بس أقل» + running vs cycling + «عجلة أكتر، وجري أقصر» | Wilson 2012, J Strength Cond Res, doi:10.1519/JSC.0b013e31823a3e2d |",
          "| EP3 | «وفاكره هيحميك من الإصابات؟ لوحده كده… مالوش لازمة» | The review finds no clear effect on all-cause/overuse injuries, but recommends stretching *within a dynamic warm-up* to reduce muscle injuries | «لوحده، الدليل مش واضح. جوه تسخين فيه حركة، ممكن يقلل إصابات العضل» | Behm 2016, Appl Physiol Nutr Metab, doi:10.1139/apnm-2015-0235 |",
          "| GEDO | «والكاف بعدها سمّته «السوبر سَب»» | The cited source documents the nickname, not that CAF gave it | «واتعرف بعدها بلقب «السوبر سَب»» | Ahram Online 2021 (as cited in v3) |",
          "| EP1 | «مالوش لازمة لو مالوش علاقة باللي هتلعبه» | Too vague to verify or act on | Concrete conditions tied to McGowan 2015 / Bishop 2003 | McGowan 2015, Sports Med, doi:10.1007/s40279-015-0376-x |",
          "", "Everything else in v3 that I checked matched its source; the additions in v4 were all checked. A1 1.4× (Sun 2015, doi:10.1249/MSS.0000000000000404) · A2 522, 33% → 22% (Hupperets 2009, doi:10.1136/bmj.b2684) · B2 n = 38 and n = 39 (Silbernagel 2007, doi:10.1177/0363546506298279; Kongsgaard 2009, doi:10.1111/j.1600-0838.2009.00949.x) · EP2 15RM → 6RM (Kongsgaard 2009 full text) · B3 MDC 1.6–1.9 cm (Powden 2015, doi:10.1016/j.math.2015.01.004) · GEDO substitutes' high-intensity running (Bradley 2014, doi:10.1123/ijspp.2013-0304; Bradley & Noakes 2013, doi:10.1080/02640414.2013.796062) · van Dyk 2019, doi:10.1136/bjsports-2018-100045 · Grindem 2016, doi:10.1136/bjsports-2016-096031. All retrieved via PubMed in this session.",
          "", "## Recurring weaknesses found in v3", "", sections.get("Recurring weaknesses across the PDF (measured where possible)", ""), "",
          "## Per-script comparison", ""]
    O = {s["meta"]["id"]: s for s in ORIG}
    for s in FINAL:
        sid = s["meta"]["id"]
        sc = SCORES["scripts"][sid]
        o = O[sid]
        L += [f"### {sid} · {o['meta']['title']} → {s['meta']['title']}", "",
              f"**Score:** v3 {sc['v3']['total']} → pass 1 {sc['pass1']['total']} → **final {sc['final']['total']}** · words {len(words(spoken_text(o)))} → {len(words(spoken_text(s)))} · est. {est(o)} → {est(s)} (estimate)", "",
              "**Diagnosis (v3)**", "", sections.get(sid, "See the series section in `evaluation/diagnosis.md`.") if sid in sections else sections.get("EP1 / EP2 / EP3 / EP5", ""), "",
              "| v3 (spoken) | v4 final (spoken) |", "|---|---|"]
        ob = [f"**{LABEL[t]}** {x}" if LABEL[t] else x for t, x in spoken_blocks(o)]
        fb = [f"**{LABEL[t]}** {x}" if LABEL[t] else x for t, x in spoken_blocks(s)]
        for i in range(max(len(ob), len(fb))):
            L.append(f"| {ob[i] if i < len(ob) else ''} | {fb[i] if i < len(fb) else ''} |")
        L += ["", "| Dimension | v3 | final | Justification (v3 → final) |", "|---|---|---|---|"]
        for d in D:
            a, b = sc["v3"]["scores"][d], sc["final"]["scores"][d]
            flag = "" if b > a else (" ⚠ not improved" if b == a else " ⚠ lower")
            L.append(f"| {names[d]} | {a} | {b}{flag} | v3: {sc['v3']['notes'].get(d,'')}<br>v4: {sc['final']['notes'].get(d,'')} |")
        L += ["", f"**Pass 1:** {sc['pass1']['summary']}", "", f"**Main change / remaining weakness:** {sc['final']['summary']}", ""]
    L += ["## Not rewritten (no script text in the PDF)", "", "- **EP4 «برنامج الوقاية مالوش لازمة!»**: v3 states the lines won't be written until a source on programme adherence/dose is chosen. I didn't draft it, because choosing that source is a research decision for you. A candidate to evaluate is the adherence literature on the FIFA 11+ (Soligard 2008 is already cited in v3).",
          "- **A3 «متابعة الرباط الصليبي»**: deferred in your plan. Not drafted.", ""]
    (ROOT / "deliverables" / "BEFORE_AFTER_REPORT.md").write_text("\n".join(L), encoding="utf-8")


def build_html():
    css = """
@font-face { font-family:'Noto Naskh Arabic'; src:url('assets/fonts/noto-naskh-arabic-arabic-400-normal.woff2') format('woff2'); font-weight:400; unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E,U+2010-2011,U+204F,U+2E41; }
@font-face { font-family:'Noto Naskh Arabic'; src:url('assets/fonts/noto-naskh-arabic-arabic-700-normal.woff2') format('woff2'); font-weight:700; unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E,U+2010-2011,U+204F,U+2E41; }
@page { size: A4; margin: 16mm 14mm; }
body { font-family: 'Noto Naskh Arabic','Inter','DejaVu Sans',sans-serif; direction: rtl; color:#1b1f24; line-height:1.9; font-size:12.5pt; }
h1 { font-size:22pt; margin:0 0 4px; } h2 { font-size:15pt; margin:28px 0 8px; border-bottom:2px solid #1b1f24; padding-bottom:4px; page-break-before: always; }
h2 + .card { break-before: auto; }
table.toc { width:100%; border-collapse:collapse; font-size:11pt; margin-top:14px; } .toc td,.toc th { border-bottom:1px solid #e3e7eb; padding:5px 6px; text-align:right; } .toc th { color:#5b6470; font-weight:700; }
.meta { color:#5b6470; font-size:10pt; }
.card { break-before: page; page-break-inside: avoid; border:1px solid #d7dce2; border-radius:8px; padding:12px 16px; margin:14px 0; }
.card h3 { margin:0; font-size:14pt; } .card .sub { color:#5b6470; font-size:9.5pt; direction:ltr; text-align:right; }
.spoken { background:#f4f6f8; border-radius:6px; padding:8px 14px; margin:10px 0; }
.l { margin:6px 0; font-size:13.5pt; } .tag { display:inline-block; font-size:8.5pt; color:#fff; border-radius:4px; padding:0 6px; margin-left:6px; vertical-align:middle; }
.HOOK .tag{background:#0f7b5f}.MID .tag{background:#b25d00}.END .tag{background:#2747a8}.CTA .tag{background:#6b4fa0}.ALT{color:#8a929c;font-size:11pt}.ALT .tag{background:#8a929c}
.HOOK{border-right:3px solid #0f7b5f;padding-right:8px}.MID{border-right:3px solid #b25d00;padding-right:8px}.END{border-right:3px solid #2747a8;padding-right:8px}
.notes { font-size:9.5pt; color:#39414a; } .notes ul { margin:2px 0 6px; padding-right:18px; } .src { direction:ltr; text-align:left; font-family:'Inter','DejaVu Sans',sans-serif; font-size:8.5pt; color:#2747a8; }
"""
    body = ["<h1>سكريبتات الريلز — الجولة الأولى · v4</h1>",
            "<p class='meta'>@hazemmohamed.rehab · نفس ترتيب v3 · المدد تقديرية (≈1.95 كلمة/ثانية) — اقرا كل سكريبت 3 مرات بستوب ووتش وخد الوسيط. الكلام المتلوّن بس هو اللي بيتقال؛ «بديل» للتجربة A/B ومش بيتقال.</p>"]
    toc = ["<table class='toc'><tr><th>ID</th><th>العنوان</th><th>القسم</th><th>المدة التقديرية</th><th>الهدف</th></tr>"]
    for s in FINAL:
        m = s["meta"]
        toc.append(f"<tr><td>{html.escape(m['id'])}</td><td>{html.escape(m['title'])}</td><td>{html.escape(SERIES[m['series']].split(' · ', 1)[1])}</td><td>{est(s)}</td><td>{html.escape(m.get('target','').replace('-', ' لـ '))} ث</td></tr>")
    toc.append("<tr><td>EP4 · A3</td><td colspan='4'>لسه محتاجة بحث — مش مكتوبة (زي v3)</td></tr></table>")
    body.append("".join(toc))
    current, first = None, True
    for s in FINAL:
        if s["meta"]["series"] != current:
            current = s["meta"]["series"]
            body.append(f"<h2>{html.escape(SERIES[current])}</h2>")
            first = False
        m = s["meta"]
        body.append(f"<div class='card'><h3>{html.escape(m['id'])} · {html.escape(m['title'])}</h3>"
                    f"<div class='sub'>{html.escape(m.get('title_en',''))} · {html.escape(m.get('format',''))}</div>"
                    f"<div class='meta'>المدة التقديرية: {est(s)} · {len(words(spoken_text(s)))} كلمة · الهدف {html.escape(m.get('target','').replace('-', ' لـ '))} ث</div><div class='spoken'>")
        for tag, text in s["blocks"]:
            lab = LABEL[tag]
            t = f"<span class='tag'>{lab}</span>" if lab else ""
            body.append(f"<p class='l {tag}'>{t}{html.escape(text)}</p>")
        body.append("</div><div class='notes'>")
        for title, key in (("على الشاشة / تصوير", "production"), ("ملاحظات", "notes")):
            if s[key]:
                body.append(f"<b>{title}</b><ul>" + "".join(f"<li>{html.escape(x)}</li>" for x in s[key]) + "</ul>")
        if s["sources"]:
            body.append("<b>المصادر (للمراجعة — مش للكلام)</b><div class='src'>" + "<br>".join(html.escape(x) for x in s["sources"]) + "</div>")
        body.append("</div></div>")
    body.append("<h2>لسه محتاجة بحث (زي v3)</h2><p>EP4 — برنامج الوقاية مالوش لازمة! — مستني مصدر.<br>A3 — متابعة الرباط الصليبي — مؤجل.</p>")
    doc = f"<!doctype html><html lang='ar' dir='rtl'><head><meta charset='utf-8'><title>سكريبتات الريلز v4</title><style>{css}</style></head><body>{''.join(body)}</body></html>"
    (ROOT / "deliverables" / "REWRITTEN_SCRIPTS.html").write_text(doc, encoding="utf-8")


if __name__ == "__main__":
    build_archive()
    build_collection()
    build_report()
    build_html()
    print("built: source/ORIGINAL_SCRIPTS.md, deliverables/REWRITTEN_SCRIPTS.md, deliverables/BEFORE_AFTER_REPORT.md, deliverables/REWRITTEN_SCRIPTS.html")
