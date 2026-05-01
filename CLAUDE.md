# Sonic Temple — Claude Instructions

## Project structure
- `frontend/` — React Native + Expo SDK 54 (Scott)
- `backend/` — Node/TypeScript/Express, Setlist.fm API (Keelie)

## Frontend rules

### Always after editing TypeScript files
Run `npx tsc --noEmit` from `frontend/`. Fix all errors before reporting the task done.

### Dev overrides — must be null before committing
`DEV_NOW_OVERRIDE` in `frontend/src/features/timeline/TimelineScreen.tsx` must be `null` in committed code. It's a clock mock for testing live mode. Check it before every commit.

### SQLite schema changes
Always do two things:
1. Add the column to `CREATE TABLE IF NOT EXISTS` (new installs)
2. Add an `ALTER TABLE ... ADD COLUMN` inside a try/catch in `initDb()` (existing installs)

### Do not commit backend data files from the frontend
`backend/data/artist-mbids.json` and `backend/data/final-setlists-cache.json` are owned by Keelie. Never stage them from a frontend commit.

### EAS preview builds
Env vars must be in `eas.json` under the `preview.env` block — not `.env.local`. `.env.local` only works for Expo Go.

## Key constants (frontend)
- `TRAVEL_MIN = 8` — assumed stage walk time in minutes
- `PX_PER_MIN = 2.5` — pixels per minute for conflict column offset

## Providers
- `LineupProvider` — selected bands, persisted to SQLite
- `BreakpointProvider` — departure/arrival markers per artist, persisted to SQLite
- `ThemeProvider` — colors via `useColors()`

## Breakpoints
Saved directly to SQLite on "Save" — no sync button involved. The FAB sync is only for fetching setlists from the API.
