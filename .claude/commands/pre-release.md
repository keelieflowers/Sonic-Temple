Check the frontend is ready to build and ship. Run the following in order:

1. Check DEV_NOW_OVERRIDE is null in `frontend/src/features/timeline/TimelineScreen.tsx`
2. Run `npx tsc --noEmit` from `frontend/` and confirm no errors
3. Check git status — flag if `backend/data/artist-mbids.json` or `backend/data/final-setlists-cache.json` are staged
4. Summarise what's uncommitted and whether it's safe to cut a build
