#!/usr/bin/env python3
"""
Copies disambiguation + url from artist-mbids-test.json into artist-mbids.json
only for entries where both files agree on the MBID. Entries with differing MBIDs
(manual corrections) are left completely untouched.
"""

import json
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
PROD_PATH = DATA / "artist-mbids.json"
TEST_PATH = DATA / "artist-mbids-test.json"


def main():
    prod_raw = json.loads(PROD_PATH.read_text())
    test_raw = json.loads(TEST_PATH.read_text())

    prod_artists = prod_raw.get("artists", {})
    test_entries = test_raw.get("entries", {})

    enriched = skipped_diff = skipped_missing = already_had = 0

    for key, prod_entry in prod_artists.items():
        test_entry = test_entries.get(key)
        if test_entry is None:
            skipped_missing += 1
            continue

        if prod_entry.get("mbid") != test_entry.get("mbid"):
            skipped_diff += 1
            continue

        new_dis = test_entry.get("disambiguation")
        new_url = test_entry.get("url")

        if not new_dis and not new_url:
            continue

        if prod_entry.get("disambiguation") == new_dis and prod_entry.get("url") == new_url:
            already_had += 1
            continue

        if new_dis is not None:
            prod_entry["disambiguation"] = new_dis
        if new_url is not None:
            prod_entry["url"] = new_url
        enriched += 1

    prod_raw["version"] = "0.3.0"
    PROD_PATH.write_text(json.dumps(prod_raw, indent=2) + "\n")

    print(f"Enriched  : {enriched} artists")
    print(f"Skipped (MBID mismatch — manual corrections preserved): {skipped_diff}")
    print(f"Skipped (not in test file): {skipped_missing}")
    print(f"Already up to date: {already_had}")


if __name__ == "__main__":
    main()
