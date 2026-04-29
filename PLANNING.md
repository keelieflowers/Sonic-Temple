# Sonic Temple App — Planning Document

## Concept

A festival companion app for Sonic Temple 2026 (May 14–17, Historic Crew Stadium, Columbus OH).
Built by Scott and his wife, used by each of them independently on their own phones.

The core loop:
1. Select the artists you want to see
2. Pre-sync all data at home on WiFi
3. Walk into the festival — app works fully offline
4. Navigate the day with a song-by-song timeline and conflict alerts

---

## Current State

### Backend (`backend/`)
- Node.js + TypeScript + Express 5
- Calls Setlist.fm API to fetch latest setlist per artist
- Local MBID cache (`data/artist-mbids.json`) to avoid repeat artist lookups
- Rate limiting + retry logic (tuned for Setlist.fm 2 req/sec free tier)
- Full 2026 lineup stored at `data/sonic-temple-2026-lineup.json`

### Frontend (`frontend/`)
- React Native + TypeScript + Expo Managed Flow (SDK 54)
- Expo Router with file-based routing
- Two tabs: **Artists** and **Setlists**
- Artists tab: collapsible day sections (Thu/Fri/Sat/Sun), per-band select/deselect, per-day select/deselect all
- Setlists tab: fetches setlist data for selected artists from the backend
- Theme pulled from Sonic Temple poster: cream `#F2EDE4`, red `#CC1F1F`, black `#0D0D0D`
- Offline caching: not yet implemented (next major milestone)

---

## Planned Features

### 1. Festival Schedule Sync Script ✅ (data already captured)
**What:** A script that hits the official Sonic Temple schedule API and writes normalized schedule data locally.

**Live API endpoint:**
```
https://goeventweb-static.greencopper.com/9028b1e5d5e84d8c84958f978b2774f8/sonictemplewebproject-2026/data/eng/shows.json
```
Returns 145 entries covering all 4 days across 5 stages. No auth required.

**Output:** `backend/data/sonic-temple-2026-schedule.json` ✅ already generated

**Normalized shape:**
```json
[
  {
    "artist": "My Chemical Romance",
    "slug": "my-chemical-romance",
    "date": "2026-05-14",
    "day": "Thursday",
    "stage": "Temple Stage",
    "startTime": "21:20",
    "endTime": "22:50"
  }
]
```

**Stages:** Temple Stage, Cathedral Stage, Citadel Stage, Sanctuary Stage, Altar Stage

**Script:** `backend/scripts/sync-schedule.ts` — simple fetch + normalize + write. No scraping needed.

**Scheduling:** Run every few days leading up to the festival, and definitely the day before each show day. To be set up via a scheduled Claude agent (`/schedule`).

---

### 2. Song-by-Song Timeline
**What:** Cross-reference setlist data + artist start time + song durations to produce
a minute-by-minute timeline of every song across the day.

**Math:** Set duration is known from `startTime`/`endTime`. Songs are evenly distributed across that window:
```
setDuration = endTime - startTime
song_start = startTime + (songIndex / totalSongs) * setDuration
```

**Output format (per artist):**
```
Tool — Main Stage, 9:00 PM
  9:00  Fear Inoculum
  9:17  Pneuma
  9:24  Forty Six & 2
  ...
```

**View:** Scrollable day timeline, grouped by day, showing all selected artists in chronological order.

---

### 4. Conflict Detection
**What:** When two selected artists overlap on the same day, flag the conflict visually.

**Rules:**
- Overlap = artist A's set end time is after artist B's start time (and they're on different stages)
- Same stage at same time = festival scheduling error, not a user conflict

**UI:** Conflicting time blocks highlighted (likely in red `#CC1F1F`).
The app is explicitly designed to help two people (Scott + his wife, on separate phones) navigate conflicts — knowing where hard choices exist is the primary value.

---

### 5. Offline-First / Pre-Sync
**What:** Everything needed for the festival day is fetched and cached before arrival.
Cell service at Crew Stadium is spotty — the app must work fully offline on the day.

**Data to cache locally (on device):**
- Setlist data per selected artist
- Song durations per song in each setlist
- Festival schedule (start/end times, stages)
- Computed timeline

**Storage:** AsyncStorage for moderate data; migrate to `expo-sqlite` if data grows large.

**"Sync" button UX:**
- User selects bands at home on WiFi
- Taps Sync — app fetches and caches all data for selected artists
- Shows per-artist progress so user knows when they're "ready"
- Clear indicator when fully synced / offline-safe

---

## Data Flow (Full Picture)

```
Setlist.fm API
    ↓
backend: setlistClient → festivalService
    ↓
Setlist data (songs per artist)
    +
Spotify API
    ↓
backend: spotifyClient
    ↓
Song durations (cached in song-durations.json)
    +
Festival schedule (scraped → sonic-temple-2026-schedule.json)
    ↓
Timeline computation (start time + cumulative durations)
    ↓
Frontend: cached locally on device (AsyncStorage / SQLite)
    ↓
Timeline view + conflict detection — fully offline
```

---

## Open Questions

- [ ] Is the Sonic Temple schedule page static HTML or JS-rendered?
- [ ] Will end times be available on the schedule, or only start times?
- [ ] Should the "Sync" screen show a combined progress view or per-artist?
- [ ] SQLite vs AsyncStorage — depends on how much data the full lineup cache grows to
- [ ] Should the hardcoded lineup eventually be replaced by a backend endpoint that serves `sonic-temple-2026-lineup.json`?

---

## Environment Variables (Backend)

| Variable | Purpose | Default |
|---|---|---|
| `SETLIST_API_KEY` | Setlist.fm API key | required |
| `PORT` | Server port | 3001 |
| `SETLIST_MIN_REQUEST_INTERVAL_MS` | Rate limit spacing | 600 |
| `SETLIST_REQUEST_TIMEOUT_MS` | Request timeout | 10000 |
| `SETLIST_RETRY_COUNT` | Retry attempts | 2 |
| `SETLIST_RETRY_BASE_DELAY_MS` | Retry backoff base | 750 |
| `ARTIST_MBID_STORE_PATH` | MBID cache file path | ./data/artist-mbids.json |
