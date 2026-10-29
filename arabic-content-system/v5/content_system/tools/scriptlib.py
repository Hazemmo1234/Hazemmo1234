"""Parse reel script files (see system/SCRIPT_FORMAT.md) and compute spoken-text metrics."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SPOKEN_TAGS = ("HOOK", "LINE", "MID", "END", "CTA")
TAG_RE = re.compile(r"^\[(HOOK|LINE|MID|END|CTA|ALT)\]\s*(.*)$")

# Words-per-second calibrated against the v3 PDF's own syllable-based estimates
# (see tools/calibrate.py). This is an estimate, not a measurement.
CALIBRATION_FILE = ROOT / "tools" / "calibration.json"


def load_rate():
    if CALIBRATION_FILE.exists():
        return json.loads(CALIBRATION_FILE.read_text(encoding="utf-8"))["words_per_second"]
    return 2.3


def parse(path):
    text = Path(path).read_text(encoding="utf-8")
    meta, body = {}, text
    if text.startswith("---"):
        _, fm, body = text.split("---", 2)
        for line in fm.strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip()] = v.strip()
    sections, current = {}, None
    for line in body.splitlines():
        if line.startswith("## "):
            current = line[3:].strip().upper()
            sections[current] = []
        elif current is not None and line.strip():
            sections[current].append(line.rstrip())
    blocks = []
    for line in sections.get("SPOKEN", []):
        m = TAG_RE.match(line.strip())
        if m:
            blocks.append((m.group(1), m.group(2).strip()))
    return {
        "path": str(path),
        "meta": meta,
        "blocks": blocks,
        "production": [l.lstrip("- ").strip() for l in sections.get("PRODUCTION", [])],
        "notes": [l.lstrip("- ").strip() for l in sections.get("NOTES", [])],
        "sources": [l.lstrip("- ").strip() for l in sections.get("SOURCES", [])
                    if l.strip("- ").strip() and "مفيش أرقام" not in l],
    }


def spoken_blocks(script):
    return [(t, s) for t, s in script["blocks"] if t in SPOKEN_TAGS]


def spoken_text(script):
    return " ".join(s for _, s in spoken_blocks(script))


def words(text):
    return [w for w in re.split(r"[\s،,.:؟?!…«»()\-—]+", text) if w]


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.؟?!…])\s+", text) if s.strip()]


def parse_range(value):
    m = re.match(r"(\d+)\s*-\s*(\d+)", value or "")
    return (int(m.group(1)), int(m.group(2))) if m else None


def estimate_seconds(n_words, rate=None):
    rate = rate or load_rate()
    mid = n_words / rate
    # +-10% band: delivery speed and pauses vary; read aloud 3x to get the real number.
    return round(mid * 0.9), round(mid * 1.1)


def load_dir(directory):
    files = sorted(Path(directory).glob("*.md"), key=lambda p: (int(parse(p)["meta"].get("order", 99)), p.name))
    return [parse(p) for p in files]
