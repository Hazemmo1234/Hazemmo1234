"""Regression suite for the reel-writing system.

Usage:
  python3 -I content_system/tests/run_regression.py scripts/v5_final   # must pass
  python3 -I content_system/tests/run_regression.py ../scripts/v3_original  # baseline

Exit code 0 only if every case and set check passes. These checks catch known
regressions (length, banned patterns, protected lines, corrected claims, repetition).
They cannot tell whether a script is good to watch. That needs the rubric
(system/RUBRIC.md) and, ultimately, real audience data.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from scriptlib import load_dir, spoken_blocks, spoken_text, words, estimate_seconds  # noqa: E402
import lint_scripts as lint  # noqa: E402

CASES = json.loads((ROOT / "tests" / "cases.json").read_text(encoding="utf-8"))


def check_case(case, s):
    fails = []
    text = spoken_text(s)
    prod = " ".join(s["production"] + s["notes"])
    anywhere = text + " " + prod
    hook = " ".join(t for tag, t in spoken_blocks(s) if tag == "HOOK")
    end = " ".join(t for tag, t in spoken_blocks(s) if tag in ("END", "CTA"))
    issues, metrics, _, _ = lint.lint_script(s)
    if any(i["level"] == "FAIL" for i in issues):
        fails.append("lint FAIL: " + "; ".join(i["code"] for i in issues if i["level"] == "FAIL"))
    if "max_contrast" in case and metrics["contrast_reveal"] > case["max_contrast"]:
        fails.append(f"contrast reveals {metrics['contrast_reveal']} > {case['max_contrast']}")
    if "max_disclaimers" in case and metrics["spoken_disclaimers"] > case["max_disclaimers"]:
        fails.append(f"spoken disclaimers {metrics['spoken_disclaimers']} > {case['max_disclaimers']}")
    if "max_referral" in case and metrics["generic_referral"] > case["max_referral"]:
        fails.append("generic referral ending present")
    for sub in case.get("must_contain", []):
        if sub not in text:
            fails.append(f"protected line missing: «{sub}»")
    if case.get("must_contain_any") and not any(sub in text for sub in case["must_contain_any"]):
        fails.append(f"none of {case['must_contain_any']} in spoken text")
    for sub in case.get("must_not_contain", []):
        if sub in text:
            fails.append(f"corrected/banned text present: «{sub}»")
    for sub in case.get("hook_must_contain", []):
        if sub not in hook:
            fails.append(f"hook should keep «{sub}»")
    for sub in case.get("hook_must_not_contain", []):
        if sub in hook:
            fails.append(f"hook gives away «{sub}» (hold it for the middle/payoff)")
    mid = " ".join(t for tag, t in spoken_blocks(s) if tag == "MID")
    for sub in case.get("mid_must_contain", []):
        if sub not in mid:
            fails.append(f"the turn «{sub}» should land in the [MID] block")
    for sub in case.get("production_must_contain", []):
        if sub not in prod:
            fails.append(f"production notes missing «{sub}»")
    if case.get("payoff_keywords") and not any(k in end for k in case["payoff_keywords"]):
        fails.append(f"ending doesn't pay off the hook (none of {case['payoff_keywords']})")
    for num in case.get("required_numbers_anywhere", []):
        if not re.search(rf"(?<!\d){re.escape(num)}(?!\d)", anywhere):
            fails.append(f"number {num} missing (spoken or on screen)")
    for src in case.get("required_sources", []):
        if not any(src in x for x in s["sources"]):
            fails.append(f"source missing: {src}")
    for pat in case.get("forbidden_regex", []):
        if re.search(pat, text):
            fails.append(f"forbidden claim matched /{pat}/")
    for q in case.get("keeps_qualifier", []):
        if q not in text:
            fails.append(f"qualifier dropped: «{q}»")
    if "max_est_seconds_hi" in case:
        hi = estimate_seconds(len(words(text)))[1]
        if hi > case["max_est_seconds_hi"]:
            fails.append(f"estimated upper duration {hi}s > {case['max_est_seconds_hi']}s")
    if "min_refrain" in case and metrics["refrain"] < case["min_refrain"]:
        fails.append(f"series refrain used {metrics['refrain']}x < {case['min_refrain']}")
    return fails


def set_checks(scripts):
    cfg, fails = CASES["set_checks"], []
    issues, table = lint.lint_collection(scripts)
    refs = [r["id"] for r in table if r["generic_referral"]]
    if len(refs) > cfg["max_generic_referral_scripts"]:
        fails.append(f"generic referral endings in {refs}")
    if cfg.get("no_repeated_hook_opener") and any(i["code"] == "repeated_hook_opener" for i in issues):
        fails.append("repeated hook opener")
    if cfg.get("no_similar_endings_within_series") and any(i["code"] == "similar_endings" for i in issues):
        fails.append("similar endings: " + "; ".join(i["msg"] for i in issues if i["code"] == "similar_endings"))
    if cfg.get("maloosh_conditions_unique"):
        seen = {}
        for s in scripts:
            if s["meta"].get("series") != "maloosh":
                continue
            for _, line in spoken_blocks(s):
                m = re.search(r"مالوش لازمة لو (.{4,22})", line)
                if m:
                    key = " ".join(words(m.group(1))[:2])
                    seen.setdefault(key, set()).add(s["meta"]["id"])
        dup = {k: sorted(v) for k, v in seen.items() if len(v) > 1}
        if dup:
            fails.append(f"same «مالوش لازمة لو …» condition reused across episodes: {dup}")
    if cfg.get("story_structures_unique"):
        shapes = {}
        for s in scripts:
            if s["meta"].get("series") == "story":
                shapes.setdefault(s["meta"].get("structure", "?"), []).append(s["meta"]["id"])
        dup = {k: v for k, v in shapes.items() if len(v) > 1}
        if dup:
            fails.append(f"stories share a structure: {dup}")
    sc = [i for i in issues if i["code"] == "sports_cliche"]
    if sc:
        fails.append("sports clichés: " + "; ".join(i["msg"] for i in sc))
    approved_q = [s["meta"]["id"] for s in scripts if s["meta"].get("series") == "approved"
                  and "؟" in " ".join(t for tag, t in spoken_blocks(s) if tag == "HOOK").split(".")[0]]
    if len(approved_q) > cfg["max_question_hooks_in_approved"]:
        fails.append(f"{len(approved_q)} approved reels open with a question: {approved_q}")
    return fails


def main(argv):
    directory = Path(argv[1]) if len(argv) > 1 else ROOT.parent / "scripts" / "v5_final"
    scripts = {s["meta"]["id"]: s for s in load_dir(directory)}
    total, passed = 0, 0
    print(f"# regression: {directory}\n")
    for case in CASES["cases"]:
        total += 1
        s = scripts.get(case["id"])
        if not s:
            print(f"FAIL {case['id']:<5} script missing from directory")
            continue
        fails = check_case(case, s)
        if fails:
            print(f"FAIL {case['id']:<5} [{case['type']}]")
            for f in fails:
                print(f"       - {f}")
        else:
            passed += 1
            print(f"PASS {case['id']:<5} [{case['type']}]")
    total += 1
    sf = set_checks(list(scripts.values()))
    if sf:
        print("FAIL SET")
        for f in sf:
            print(f"       - {f}")
    else:
        passed += 1
        print("PASS SET   [collection-level checks]")
    print(f"\n{passed}/{total} passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
