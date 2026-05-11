#!/usr/bin/env python3
"""
Compare artist-mbids.json (production) against artist-mbids-test.json (new logic).

Run with:
  cd backend && python3 scripts/compare-mbids.py

Shows:
  - Artists where MBIDs differ between the two files
  - Artists missing from the test file (not matched by new logic)
  - Artists missing from the production file (new additions)
  - Summary counts
"""

import json
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
PROD_PATH = DATA / "artist-mbids.json"
TEST_PATH = DATA / "artist-mbids-test.json"


def normalize(name: str) -> str:
    return " ".join(name.strip().lower().split())


def load_prod(path: Path) -> dict[str, dict]:
    """Load v0.2.0 / v0.3.0 artist-mbids.json → {normalized_key: entry}"""
    raw = json.loads(path.read_text())
    return {k: v for k, v in raw.get("artists", {}).items()}


def load_test(path: Path) -> dict[str, dict]:
    """Load artist-mbids-test.json → {normalized_key: entry}"""
    raw = json.loads(path.read_text())
    return {k: v for k, v in raw.get("entries", {}).items()}


def main():
    if not PROD_PATH.exists():
        print(f"Production file not found: {PROD_PATH}")
        return
    if not TEST_PATH.exists():
        print(f"Test file not found: {TEST_PATH}")
        print("Run 'cd backend && npx tsx scripts/refresh-mbids-test.ts' first.")
        return

    prod = load_prod(PROD_PATH)
    test = load_test(TEST_PATH)

    prod_keys = set(prod.keys())
    test_keys = set(test.keys())
    all_keys = prod_keys | test_keys

    mbid_diff = []
    only_in_prod = []
    only_in_test = []
    match = []

    for key in sorted(all_keys):
        p = prod.get(key)
        t = test.get(key)

        if p is None:
            only_in_test.append((key, t))
        elif t is None:
            only_in_prod.append((key, p))
        elif p.get("mbid") != t.get("mbid"):
            mbid_diff.append((key, p, t))
        else:
            match.append(key)

    # ── MBID differences ──────────────────────────────────────────────────────
    print("=" * 70)
    print(f"MBID DIFFERENCES  ({len(mbid_diff)} artists)")
    print("=" * 70)
    if mbid_diff:
        for key, p, t in mbid_diff:
            input_name = p.get("inputBandName") or t.get("inputBandName") or key
            print(f"\n  {input_name}")
            print(f"    prod : {p.get('mbid')}  → \"{p.get('matchedArtistName')}\"")
            prod_dis = p.get("disambiguation")
            if prod_dis:
                print(f"           disambiguation: {prod_dis}")
            test_status = t.get("status", "?")
            test_dis = t.get("disambiguation")
            print(f"    test : {t.get('mbid')}  → \"{t.get('matchedArtistName')}\"  [{test_status}]")
            if test_dis:
                print(f"           disambiguation: {test_dis}")
            print(f"    scores: best={t.get('bestScore')} second={t.get('secondScore')}")
    else:
        print("  (none)")

    # ── Only in test (new matches / changed status) ───────────────────────────
    print()
    print("=" * 70)
    print(f"ONLY IN TEST FILE  ({len(only_in_test)} artists)")
    print("=" * 70)
    if only_in_test:
        for key, t in only_in_test:
            print(f"  {t.get('inputBandName', key)}  [{t.get('status')}]  mbid={t.get('mbid')}")
    else:
        print("  (none)")

    # ── Only in prod (not found by new logic) ─────────────────────────────────
    print()
    print("=" * 70)
    print(f"ONLY IN PROD FILE  ({len(only_in_prod)} artists)")
    print("=" * 70)
    if only_in_prod:
        for key, p in only_in_prod:
            print(f"  {p.get('inputBandName', key)}  mbid={p.get('mbid')}")
    else:
        print("  (none)")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total artists across both files : {len(all_keys)}")
    print(f"  MBIDs match                     : {len(match)}")
    print(f"  MBIDs differ                    : {len(mbid_diff)}")
    print(f"  Only in prod (missing from test): {len(only_in_prod)}")
    print(f"  Only in test (new)              : {len(only_in_test)}")

    # Show ambiguous entries from test for visibility
    ambiguous = [(k, v) for k, v in test.items() if v.get("status") == "ambiguous"]
    if ambiguous:
        print()
        print("=" * 70)
        print(f"AMBIGUOUS IN TEST  ({len(ambiguous)} artists — not stored to prod)")
        print("=" * 70)
        for key, t in sorted(ambiguous):
            print(
                f"  {t.get('inputBandName', key):40s} "
                f"best={t.get('bestScore'):4}  second={t.get('secondScore'):4}  "
                f"→ \"{t.get('matchedArtistName')}\"  ({t.get('disambiguation') or 'no disambiguation'})"
            )


if __name__ == "__main__":
    main()
