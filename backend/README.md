## Festival Backend v0.0.1

Simple Node + TypeScript backend that accepts band names, searches Setlist.fm,
and returns first artist match plus latest show details.

### Setup

```bash
cd backend
npm install
cp .env.example .env
```

Set `SETLIST_API_KEY` in `backend/.env`.
You can also tune outbound Setlist request pacing to reduce 429 responses:

- `SETLIST_MIN_REQUEST_INTERVAL_MS` (default `600`)
- `SETLIST_REQUEST_TIMEOUT_MS` (default `10000`)
- `SETLIST_RETRY_COUNT` (default `2`)
- `SETLIST_RETRY_BASE_DELAY_MS` (default `750`)
- `LOG_LEVEL` (`debug` | `info` | `warn`, default `info`)

For your current `2/sec` tier, keep `SETLIST_MIN_REQUEST_INTERVAL_MS` at `600` (or higher) so requests are intentionally slower but more reliable.

### Local MBID store (v0.2.0)

To avoid repeatedly searching artist MBIDs for the same band names, the backend now uses a local JSON file store:

- `ARTIST_MBID_STORE_PATH` (default `./data/artist-mbids.json`)
- `FINAL_SETLIST_CACHE_PATH` (default `./data/final-setlists-cache.json`)
- `FINAL_SETLIST_CACHE_TTL_HOURS` (default `24`)
- `FESTIVAL_VENUES_PATH` (default `./data/festival-venues.json`)
- `LOCAL_SCHEDULE_PATH` (default `./data/sonic-temple-2026-schedule.json`)
- `SONIC_TEMPLE_SHOWS_URL` (default live Sonic Temple feed)

When `POST /api/festival/artist-shows` runs, it checks this store first for each band name. If missing, it searches Setlist, picks best match, then saves the MBID locally.

Populate/update MBIDs explicitly with:

`POST /api/festival/artist-mbids/refresh`

Request body:

```json
{
  "forceRefresh": false
}
```

Behavior:
- Fetches lineup artist names from live `shows.json` (falls back to local schedule file).
- Adds only missing MBIDs to cache (never overwrites existing MBIDs).
- Skips ambiguous MBID matches and returns them in `needsReview`.
- Regenerates final setlist cache if expired, missing artists, or `forceRefresh=true`.

### Run

```bash
cd backend
npm run dev
```

Backend starts at `http://localhost:3001` (or `PORT` from `.env`).

### API

`POST /api/festival/artist-shows`

Request body:

```json
{
  "bandNames": ["Bad Omens", "Spiritbox"],
  "forceRefresh": false
}
```

Response shape:

```json
{
  "cache": {
    "hit": false,
    "generatedAt": "2026-04-30T11:00:00.000Z",
    "expiresAt": "2026-05-01T11:00:00.000Z"
  },
  "results": [
    {
      "inputBandName": "Bad Omens",
      "artistMatch": {
        "mbid": "eecada09-acfc-472d-ae55-e9e5a43f12d8",
        "name": "Bad Omens",
        "sortName": "Bad Omens",
        "disambiguation": "metalcore band",
        "url": "https://www.setlist.fm/setlists/bad-omens-53c0ab3d.html"
      },
      "latestSetlist": {
        "id": "setlist-id",
        "eventDate": "20-04-2026",
        "tourName": "Tour Name",
        "venueName": "Venue Name",
        "cityName": "Boston",
        "countryCode": "US",
        "sections": [{ "name": "Set 1", "songs": ["Song A", "Song B"] }],
        "songCount": 2
      },
      "status": "ok"
    }
  ]
}
```

Possible `status` values:

- `ok`
- `no_artist_match`
- `no_setlist_found`
- `api_error`

### curl example

```bash
curl -X POST "http://localhost:3001/api/festival/artist-shows" \
  -H "Content-Type: application/json" \
  -d '{"bandNames":["Bad Omens","Spiritbox"]}'
```

### Test

```bash
cd backend
npm test
```
