#!/usr/bin/env python3
"""
One-time migration: final-setlists-cache.json v0.0.3 → v0.0.4

v0.0.3: entries keyed by sorted pipe-joined batch of band names
v0.0.4: entries keyed by normalized individual band name (one entry per artist)

Dedup rule: for each artist, keep the entry with the most songs.
Tie-break: most recent generatedAt (so fresh data beats stale data of equal size).
Exception to the tie-break: the most-songs rule means a manually edited entry
with more songs always wins regardless of age.
"""

import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

CACHE_PATH = Path(__file__).parent.parent / "data" / "final-setlists-cache.json"


def normalize(name: str) -> str:
    return " ".join(name.strip().lower().split())


def song_count(result: dict) -> int:
    setlist = result.get("latestSetlist") or {}
    return sum(len(s.get("songs", [])) for s in setlist.get("sections", []))


def migrate(path: Path) -> None:
    with open(path) as f:
        old = json.load(f)

    if old.get("version") == "0.0.4":
        print("Already v0.0.4 — nothing to do.")
        return

    if old.get("version") != "0.0.3":
        print(f"Unexpected version '{old.get('version')}', aborting.", file=sys.stderr)
        sys.exit(1)

    # artist_key -> {"result", "generatedAt", "expiresAt", "songs"}
    best: dict = {}

    for batch_entry in old["entries"].values():
        generated_at = batch_entry["generatedAt"]
        expires_at = batch_entry["expiresAt"]
        for result in batch_entry["results"]:
            key = normalize(result["inputBandName"])
            songs = song_count(result)
            existing = best.get(key)
            if existing is None:
                best[key] = dict(result=result, generatedAt=generated_at,
                                 expiresAt=expires_at, songs=songs)
            else:
                # Keep the entry with more songs; tie-break by recency
                if songs > existing["songs"] or (
                    songs == existing["songs"] and generated_at > existing["generatedAt"]
                ):
                    best[key] = dict(result=result, generatedAt=generated_at,
                                     expiresAt=expires_at, songs=songs)

    # Give all migrated entries a 30-day expiry so the app doesn't immediately
    # re-fetch everything. Use forceRefresh whenever you want fresh data.
    fresh_expiry = (datetime.now(timezone.utc) + timedelta(days=30)).strftime(
        "%Y-%m-%dT%H:%M:%S.000Z"
    )

    new_entries = {
        key: {
            "generatedAt": data["generatedAt"],
            "expiresAt": fresh_expiry,
            "result": data["result"],
        }
        for key, data in best.items()
    }

    new_cache = {"version": "0.0.4", "entries": new_entries}

    with open(path, "w") as f:
        json.dump(new_cache, f, indent=2)
        f.write("\n")

    print(f"Migrated {len(new_entries)} artists from {len(old['entries'])} batch entries.")

    # Spot-check Shinedown
    sd = new_entries.get("shinedown")
    if sd:
        songs = []
        for section in (sd["result"].get("latestSetlist") or {}).get("sections", []):
            songs.extend(section.get("songs", []))
        print(f"\nShinedown ({len(songs)} songs): {songs}")
    else:
        print("\nShinedown: not found in migrated cache.")


if __name__ == "__main__":
    migrate(CACHE_PATH)
