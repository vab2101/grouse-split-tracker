# Grouse Split Tracker

Track split times at numbered trail markers. Tap button as you pass each marker. App records time, GPS, and elevation. No backend. Runs in browser.

## Features

- Timer starts when you begin hike. Tap each marker as you pass.
- Missed a marker? "Forgot marker" button logs it retroactively.
- Hold screen lock button 3 seconds to prevent accidental taps.
- GPS dot shows position on trail map. Color indicates accuracy.
- Elevation profile updates as you climb.
- Device screen stays awake during active hike.
- All hikes saved to browser localStorage. No account needed.
- Compare up to 3 hikes side by side.
- See best and average times per segment across all hikes.
- Export any hike to CSV (marker, time, coords, accuracy).

## Architecture

Single-page React app. No backend. Everything lives in the browser.

```
src/
  components/
    ActiveHike.tsx      # main hike screen (timer, marker buttons, map)
    HikeHistory.tsx     # list of past hikes with splits
    HikeComparison.tsx  # side-by-side hike comparison
    TrailProgress.tsx   # elevation sparkline
    MapBackground.tsx   # trail map with contour lines
  lib/
    hike-store.ts       # localStorage read/write, trail constants
    trail-markers.ts    # per-marker elevation/distance lookup table
    trail-gpx.ts        # 195 GPS points defining the trail route
    trail-bounds.ts     # map projection and bounding box
  hooks/
    use-gps.ts          # GPS position hook
    use-wake-lock.ts    # keep screen on
scripts/
  build-contours.mjs    # generates public/bcmc-contours.svg from DEM tiles
public/
  bcmc-contours.svg     # pre-baked elevation contours for the map
```

**Stack:** React 18, TypeScript, Vite, Tailwind CSS, Recharts, MapLibre-contour.

## Porting to a Different Trail (e.g. Grouse Grind)

### Step 1 — Update trail constants

File: `src/lib/hike-store.ts`

```ts
MAX_MARKERS = 50          // how many markers on the new trail
TRAIL_DISTANCE_KM = 2.9   // total trail distance in km
TRAIL_ELEVATION_GAIN = 853 // total elevation gain in meters
TRAIL_BASE_ELEVATION = 290 // elevation at trailhead in meters ASL
```

Also update the localStorage key names (`bcmc-hike-attempts`, `bcmc-active-hike`, `bcmc-marker-gps`) so old data does not bleed into the new trail.

### Step 2 — Replace the marker table

File: `src/lib/trail-markers.ts`

Replace the `MARKER_TABLE` array. Each entry needs:

```ts
{ marker: 5, elevationPct: 12.3, distancePct: 10.1, distanceM: 294, elevation: 388 }
```

- `marker` — the physical marker number on trail
- `distanceM` — meters from start
- `elevation` — meters ASL
- `elevationPct` / `distancePct` — percentage of total gain / distance (0–100)

First entry must be marker 0 (trailhead). Last entry must be the finish marker. Markers with no field data can be omitted; the app interpolates from neighbors.

### Step 3 — Replace the GPS route

File: `src/lib/trail-gpx.ts`

Replace the `TRAIL_ROUTE` array with points from your GPX file:

```ts
{ lat: 49.3711, lng: -123.0996, ele: 296.9 }
```

Export a GPX from AllTrails, Strava, or Gaia GPS. Parse it into this format. ~100–200 points is enough.

### Step 4 — Regenerate contour map

Run:

```bash
node scripts/build-contours.mjs
```

This fetches DEM tiles for the trail area and writes `public/bcmc-contours.svg`. Update the lat/lng bounds inside the script to match the new trail before running.

### Step 5 — Update UI text

- `index.html` — page title and og:description
- `src/components/ActiveHike.tsx` — trail name, distance, elevation, and finish-line instructions shown on the start screen (around lines 207–232)
