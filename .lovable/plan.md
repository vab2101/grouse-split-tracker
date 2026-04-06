

## Problem

Two issues to address:

1. **Data connection during active hike**: The app currently stores the in-progress hike only in React state and only writes to localStorage on finish. If the browser reloads mid-hike, all data is lost (the bug from the earlier conversation). The fix is to persist the active attempt to localStorage on every state change (start, marker tap, skip) so the app works fully offline and survives reloads — no network needed at all during a hike.

2. **Accidental navigation/reload**: No protection exists against closing the tab, refreshing, or switching tabs during an active hike.

## Plan

### 1. Persist in-progress hike to localStorage continuously

- Add `ACTIVE_HIKE_KEY` constant to `hike-store.ts`
- Add `saveActiveHike(attempt: HikeAttempt | null)` and `loadActiveHike(): HikeAttempt | null` functions
- In `ActiveHike.tsx`, call `saveActiveHike()` after every `setAttempt` — on start, marker tap, skip, and clear it on finish
- On mount, check for a saved active hike and restore it (resume the timer from where it left off)
- This means zero network dependency during an active hike — everything is localStorage only

### 2. Add `beforeunload` warning

- In `ActiveHike.tsx`, add a `useEffect` that registers a `beforeunload` event listener when `isRunning` is true
- The browser will show its native "Leave site? Changes you made may not be saved" dialog on refresh/close

### 3. Add in-app navigation guard

- In `ActiveHike.tsx` (or `Index.tsx`), when a hike is running and the user taps the "History" tab, show a confirmation dialog ("You have an active hike. Leaving will keep it running in the background. Continue?")
- Use a simple `window.confirm()` or a styled dialog component — `window.confirm` is simpler and sufficient here

### Files changed

| File | Change |
|------|--------|
| `src/lib/hike-store.ts` | Add `saveActiveHike`, `loadActiveHike`, `clearActiveHike` |
| `src/components/ActiveHike.tsx` | Persist on every mutation, restore on mount, add `beforeunload` listener |
| `src/pages/Index.tsx` | Guard tab switching when hike is active |

