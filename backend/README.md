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

For your current `2/sec` tier, keep `SETLIST_MIN_REQUEST_INTERVAL_MS` at `600` (or higher) so requests are intentionally slower but more reliable.

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
  "bandNames": ["Bad Omens", "Spiritbox"]
}
```

Response shape:

```json
{
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
