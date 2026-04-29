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
