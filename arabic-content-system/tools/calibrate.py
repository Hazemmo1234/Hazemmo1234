"""Calibrate words/second from the v3 PDF's stated syllable-based duration estimates.

The v3 PDF estimated duration from syllable counts at 4-5 syllables/second plus short
pauses. We reuse its midpoints so that before/after durations are on the same scale.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scriptlib import ROOT, CALIBRATION_FILE, load_dir, spoken_text, words, parse_range

scripts = load_dir(ROOT / "scripts" / "v3_original")
total_w, total_s, rows = 0, 0.0, []
for s in scripts:
    r = parse_range(s["meta"].get("stated_estimate"))
    n = len(words(spoken_text(s)))
    mid = (r[0] + r[1]) / 2
    rows.append((s["meta"]["id"], n, mid, round(n / mid, 2)))
    total_w += n
    total_s += mid
rate = round(total_w / total_s, 3)
for row in rows:
    print("%-5s words=%3d stated_mid=%5.1fs  w/s=%.2f" % row)
print("pooled words/second:", rate)
CALIBRATION_FILE.write_text(json.dumps({"words_per_second": rate, "basis": "v3 PDF stated syllable estimates, pooled over 12 scripts", "per_script": rows}, ensure_ascii=False, indent=2), encoding="utf-8")
