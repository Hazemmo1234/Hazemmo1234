"""Automated lint for reel scripts.

Usage:  python3 -I tools/lint_scripts.py scripts/v4_final [--json out.json]

Checks things a machine can check reliably: length, banned/capped patterns, MSA
markers, unsourced numbers, missing structure, and repetition across the set.
It does NOT judge naturalness, originality, or whether a hook is good. Those need a
human (or the reel-evaluate skill) using system/RUBRIC.md. A clean lint is necessary,
not sufficient.
"""
import json
import re
import sys
from itertools import combinations
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from scriptlib import ROOT, load_dir, spoken_blocks, spoken_text, words, sentences, parse_range, estimate_seconds

P = json.loads((ROOT / "system" / "lint_patterns.json").read_text(encoding="utf-8"))
L = P["limits"]


def hits(patterns, text):
    found = []
    for pat in patterns:
        for m in re.finditer(pat, text):
            found.append(m.group(0).strip())
    return found


def token_set(text):
    return {w for w in words(text) if len(w) > 2}


def jaccard(a, b):
    a, b = token_set(a), token_set(b)
    return len(a & b) / max(1, len(a | b))


def lint_script(s):
    sid = s["meta"].get("id", Path(s["path"]).stem)
    issues, metrics = [], {}
    tags = [t for t, _ in spoken_blocks(s)]
    text = spoken_text(s)
    n = len(words(text))
    lo, hi = estimate_seconds(n)
    metrics.update(words=n, est_seconds=f"{lo}-{hi}")

    def add(level, code, msg):
        issues.append({"id": sid, "level": level, "code": code, "msg": msg})

    for need in ("HOOK", "MID", "END"):
        if need not in tags:
            add("FAIL", "structure", f"missing [{need}] block")

    target = parse_range(s["meta"].get("target"))
    if target:
        mid = (lo + hi) / 2
        if mid > target[1] * L["duration_tolerance"]:
            add("FAIL", "too_long", f"est {lo}-{hi}s vs target {target[0]}-{target[1]}s")
        elif mid > target[1]:
            add("WARN", "long", f"est {lo}-{hi}s at/above target max {target[1]}s")
        elif mid < target[0] * 0.8:
            add("WARN", "short", f"est {lo}-{hi}s well under target {target[0]}s")

    hook = next((t for tag, t in spoken_blocks(s) if tag == "HOOK"), "")
    first = sentences(hook)[0] if hook else ""
    metrics["hook_first_sentence_words"] = len(words(first))
    if len(words(first)) > L["hook_max_words"]:
        add("WARN", "hook_long", f"first hook sentence has {len(words(first))} words (>{L['hook_max_words']})")

    c = hits(P["contrast_reveal"], text)
    metrics["contrast_reveal"] = len(c)
    if len(c) > L["contrast_reveal_max"] + 1:
        add("FAIL", "contrast_reveal", f"{len(c)} 'مش X… Y' reveals: {c}")
    elif len(c) > L["contrast_reveal_max"]:
        add("WARN", "contrast_reveal", f"{len(c)} 'مش X… Y' reveals (cap {L['contrast_reveal_max']}): {c}")

    d = hits(P["spoken_disclaimer"], text)
    metrics["spoken_disclaimers"] = len(d)
    if len(d) > L["spoken_disclaimer_max"]:
        add("WARN", "disclaimers", f"{len(d)} spoken disclaimers; move to on-screen/caption: {d}")

    sp = hits(P["stock_phrases"], text)
    if sp:
        add("FAIL", "stock_phrase", f"stock/AI phrases: {sp}")
    msa = hits(P["msa_markers"], text)
    if msa:
        add("WARN", "msa", f"MSA markers in spoken text: {msa}")
    if "—" in text:
        add("FAIL", "em_dash", "em dash in spoken text (it can't be spoken)")

    q = text.count("؟") + text.count("?")
    metrics["questions"] = q
    qmax = L["questions_max_short"] if (target and target[1] <= 30) else L["questions_max_long"]
    if q > qmax:
        add("WARN", "questions", f"{q} questions (cap {qmax})")
    if text.count("!") > L["exclamations_max"]:
        add("WARN", "exclamations", f"{text.count('!')} exclamation marks")

    if re.search(r"\d", text) and not s["sources"]:
        add("FAIL", "unsourced_number", "spoken text has numbers but SOURCES is empty")

    ref = hits(P["generic_referral"], text)
    metrics["generic_referral"] = len(ref)
    end = " ".join(t for tag, t in spoken_blocks(s) if tag in ("END", "CTA"))
    metrics["refrain"] = text.count("مالوش لازمة")
    return issues, metrics, end, first


def lint_collection(scripts):
    all_issues, table, endings, hooks = [], [], {}, {}
    for s in scripts:
        issues, metrics, end, first = lint_script(s)
        sid = s["meta"].get("id")
        all_issues += issues
        table.append({"id": sid, **metrics})
        endings[sid] = (s["meta"].get("series"), end)
        hooks[sid] = (s["meta"].get("series"), first)

    refs = [r["id"] for r in table if r["generic_referral"]]
    if len(refs) > L["collection_generic_referral_max"]:
        all_issues.append({"id": "SET", "level": "WARN", "code": "repeated_referral_cta",
                           "msg": f"generic 'see a professional' ending in {len(refs)} scripts: {refs}"})
    for (a, (sa, ea)), (b, (sb, eb)) in combinations(endings.items(), 2):
        sim = jaccard(ea, eb)
        if sim > L["ending_similarity_max"] and sa == sb and sa != "maloosh":
            all_issues.append({"id": "SET", "level": "WARN", "code": "similar_endings",
                               "msg": f"{a} and {b} endings overlap {sim:.2f}"})
    openers = {}
    for sid, (series, h) in hooks.items():
        if series == "maloosh":
            continue  # the refrain is the series format
        key = " ".join(words(h)[:2])
        openers.setdefault(key, []).append(sid)
    for key, ids in openers.items():
        if len(ids) > 1:
            all_issues.append({"id": "SET", "level": "WARN", "code": "repeated_hook_opener",
                               "msg": f"hooks {ids} open the same way: '{key}'"})
    return all_issues, table


def main(argv):
    directory = Path(argv[1]) if len(argv) > 1 else ROOT / "scripts" / "v4_final"
    scripts = load_dir(directory)
    issues, table = lint_collection(scripts)
    print(f"# lint: {directory}  ({len(scripts)} scripts)\n")
    print("id     words  est_s   hookW  contrast disclaim  Q  refer")
    for r in table:
        print(f"{r['id']:<6} {r['words']:>5}  {r['est_seconds']:<7} {r['hook_first_sentence_words']:>4}  {r['contrast_reveal']:>6}  {r['spoken_disclaimers']:>6}  {r['questions']:>3} {r['generic_referral']:>4}")
    print()
    for i in issues:
        print(f"{i['level']:<4} {i['id']:<5} {i['code']:<22} {i['msg']}")
    fails = sum(1 for i in issues if i["level"] == "FAIL")
    warns = sum(1 for i in issues if i["level"] == "WARN")
    print(f"\n{fails} FAIL, {warns} WARN")
    if "--json" in argv:
        out = Path(argv[argv.index("--json") + 1])
        out.write_text(json.dumps({"table": table, "issues": issues}, ensure_ascii=False, indent=2), encoding="utf-8")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
