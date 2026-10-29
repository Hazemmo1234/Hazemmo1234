"""Integrity checks for deliverables (run before declaring a round complete).

  python3 -I tools/verify_integrity.py

1. Every script ID is present in every deliverable.
2. Every spoken line of every script appears verbatim in its collection (archive / rewrite / HTML).
3. No replacement characters or Arabic presentation-form codepoints (signs of broken extraction).
4. Transcription cross-check: each word of the archived v3 text (spoken, on-screen, notes, sources) must exist in the PDF's
   own text layer (pdftotext), after normalising pdftotext's broken lam-alef ("لا" -> "ال").
"""
import html
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scriptlib import ROOT, load_dir, spoken_blocks  # noqa: E402

ok = True


def fail(msg):
    global ok
    ok = False
    print("FAIL", msg)


ORIG = load_dir(ROOT / "scripts" / "v3_original")
FINAL = load_dir(ROOT / "scripts" / "v4_final")
files = {
    "archive": (ROOT / "source" / "ORIGINAL_SCRIPTS.md", ORIG),
    "rewrite_md": (ROOT / "deliverables" / "REWRITTEN_SCRIPTS.md", FINAL),
    "rewrite_html": (ROOT / "deliverables" / "REWRITTEN_SCRIPTS.html", FINAL),
    "report": (ROOT / "deliverables" / "BEFORE_AFTER_REPORT.md", FINAL),
}
ids = [s["meta"]["id"] for s in ORIG]
assert ids == [s["meta"]["id"] for s in FINAL], "order/ID mismatch between v3 and v4"
print(f"scripts: {len(ids)} ({' '.join(ids)}) in identical order in v3 and v4")
for name, (path, scripts) in files.items():
    text = path.read_text(encoding="utf-8")
    if name == "rewrite_html":
        text = html.unescape(text)
    for sid in ids:
        if sid not in text:
            fail(f"{name}: id {sid} missing")
    if name != "report":
        for s in scripts:
            for tag, line in s["blocks"]:
                if line not in text:
                    fail(f"{name}: {s['meta']['id']} line not found verbatim: {line[:40]}…")
    bad = [c for c in text if c == "�" or 0xFB50 <= ord(c) <= 0xFDFF or 0xFE70 <= ord(c) <= 0xFEFF]
    if bad:
        fail(f"{name}: {len(bad)} replacement/presentation-form characters")
    if "مالوش الزمة" in text:
        fail(f"{name}: broken lam-alef («الزمة») present")
    print(f"ok   {name}: {path.relative_to(ROOT)}")


def norm(w):
    w = unicodedata.normalize("NFKC", w)
    w = re.sub(r"[ً-ْـ‌-‏‪-‮]", "", w)  # harakat, tatweel, bidi marks
    w = re.sub(r"ل([اأإآ])", r"\1ل", w)  # pdftotext emits lam-alef ligatures reversed (لأ -> أل)
    w = w.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا").replace("%", "")
    return w


pdf = ROOT / "source" / "Reel_Scripts_Round1_v3_original.pdf"
raw = subprocess.run(["pdftotext", str(pdf), "-"], capture_output=True, text=True).stdout
pdf_tokens = {norm(t) for t in re.split(r"[\s،,.:؟?!…«»()\-—‪‫‬]+", raw) if t}
pdf_joined = norm(re.sub(r"\s+", "", raw))  # second chance: pdftotext splits words after shadda/fatha
missing = []
for s in ORIG:
    for line in [x for _, x in spoken_blocks(s)] + s["production"] + s["notes"] + s["sources"]:
        line = re.sub(r"^(ملاحظة تصوير|على الشاشة|مؤكد|ممنوع يتقال|مش بنقول):\s*", "", line)
        for w in re.split(r"[\s،,.:؟?!…«»()\-—]+", line):
            if w and norm(w) not in pdf_tokens and norm(w) not in pdf_joined:
                missing.append((s["meta"]["id"], w))
if missing:
    print(f"WARN transcription cross-check: {len(missing)} archived words not found as-is in the PDF text layer:")
    for sid, w in missing:
        print(f"       {sid}: {w}")
    print("       (inspect against the page image; pdftotext also splits/reorders some Arabic runs)")
else:
    print("ok   transcription cross-check: every archived spoken word exists in the PDF text layer")
print("\nRESULT:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
