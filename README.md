# Grouse Split Tracker

Track split times at numbered trail markers. Tap button as you pass each marker. App records time, GPS, and elevation. No backend. Runs in browser.

## Features

- Timer starts when you begin hike. Tap each marker as you pass.
- **Automatic marker tracking (Auto mode).** When GPS is accurate and the upcoming marker has a known position, the app arms an "Approaching _n_" zone around it, keeps the closest GPS fix, and commits the split automatically as you walk out of the zone.
- **Manual mode with override.** The marker button shows the logging mode (Auto / Manual). The app falls back to Manual automatically when the next marker has no known position, GPS is offline, or accuracy is worse than 30 m. A top-left switch lets the user force Manual at any time; tapping the marker button in Manual mode always commits at the live GPS position.
- **Manual-mode progress.** For markers missing from the dataset, progress (distance + elevation) is computed by snapping to the master-trail waypoints when GPS is good, or by interpolating between the nearest known markers when GPS is not.
- Missed a marker? "Forgot marker" button logs it retroactively.
- **Tag button.** Drop a timestamped tag mid-hike with a short note. Tags show up interleaved with markers in the history view and in the CSV export.
- **Start / Finish GPS.** The app records a GPS fix at Start and Finish and includes them in the CSV export (not shown in the UI).
- Hold screen lock button 3 seconds to prevent accidental taps.
- GPS dot shows position on trail map. Color indicates accuracy.
- Elevation profile updates as you climb.
- Device screen stays awake during active hike.
- All hikes saved to browser localStorage. No account needed.
- Compare up to 3 hikes side by side.
- See best and average times per segment across all hikes.
- Export any hike to CSV (marker, time, coords, accuracy, logging mode, tags).

## Marker button — what it shows and why

The large marker button in the map area has three pieces of text. All three are driven by the same underlying state machine — they just surface different parts of it.

```
┌─────────────────────────┐
│    [ Auto | Manual ]    │  ← mode pill (top)
│           📍            │
│           25            │  ← next marker number (or "Approaching 25")
│   ~18 m to marker       │  ← live hint (bottom)
└─────────────────────────┘
```

### The mode pill

Either `Auto` or `Manual`. Mode is recomputed on every render from three inputs:

| Condition | Forces mode to `Manual`? |
|---|---|
| User flipped the top-left toggle | yes |
| Next marker has no known GPS position (31, 33, 44, 45) | yes |
| No GPS fix, or `accuracy > 30 m` | yes |
| Otherwise | `Auto` |

The mode at commit time is saved on the split and exported in the CSV `Logging Mode` column.

### The bottom hint

Three possible values, all carrying the same reassurance: *"here is what will happen if you do nothing / tap now."*

| Hint | When | Meaning |
|---|---|---|
| `~X m to marker` | `Auto`, not yet inside approach zone | GPS is being watched; X is distance to the next marker. App will auto-commit when you walk past it. |
| `Approaching n` *(replaces the number)* | `Auto`, inside approach zone | Closest-approach tracker is running. App will commit the best fix as soon as you exit the zone (two consecutive rising-distance fixes). |
| `Tap at marker` | `Manual` | App is not watching. You must tap the button when you pass the marker. |

### How `~X m to marker` is computed

The preferred value is **along-trail distance**: snap the live GPS fix to the nearest master-trail waypoint, get its cumulative trail distance, and subtract from the marker's known trail distance.

```ts
straightM  = haversine(GPS, marker.lat/lng)
snappedM   = snapToMasterTrail(GPS).distanceM
trailDelta = marker.distanceM − snappedM
return trailDelta > 0 ? trailDelta : straightM
```

The haversine fallback kicks in when `trailDelta` is negative — i.e. the snap lands on a trail vertex *further along the trail than the marker*. That happens on switchbacks and near switchbacks where the closest-by-metres vertex may actually be on a later leg of the trail:

```
Trail vertices and cumulative distance:
  … ── v102(1500m) ── v103(1520m) ── [MARKER 25 @ 1540m] ── v104(1560m) ── v105(1580m) ── …

User GPS near marker 25 snaps to v105 (1580 m):
  trailDelta = 1540 − 1580 = −40 m        ← meaningless as "distance to go"
  straightM  = haversine(GPS, marker 25) = 18 m
  displayed  = ~18 m to marker            ← always ≥ 0, safe bound
```

The same fallback covers the marker-past-GPS case (user is genuinely a few metres past the marker but the approach-zone commit hasn't fired yet) and the off-trail-detour case.

### The approach zone

When mode is `Auto` and the live GPS fix is within the zone around the next marker, the button label changes to `Approaching n` and the app keeps the closest `(trackpoint, timestamp)` seen so far. When you walk out of the zone (two consecutive rising-distance fixes), that best-approach point is committed as the split — equivalent to a button press at that moment. Manual tap at any time (including inside the zone) wins and commits immediately at the live GPS position.

```
Fix 1: dist=12m → enter zone, best=12m
Fix 2: dist= 8m → best=8m, increasing=0
Fix 3: dist= 5m → best=5m (closest)
Fix 4: dist= 7m → outside radius, increasing=1
Fix 5: dist=11m → increasing=2 → COMMIT at Fix 3's (coord, timestamp)
```

Tunables (see top of `src/components/ActiveHike.tsx`):

- `GPS_ACCURACY_MAX_M = 30` — Auto falls back to Manual above this accuracy
- `APPROACH_RADIUS_MIN_M = 15` — floor on the approach-zone radius
- `APPROACH_RADIUS_ACCURACY_FACTOR = 1.5` — radius = `max(15 m, accuracy × 1.5)`
- `EXIT_INCREASING_FIXES = 2` — consecutive rising-distance fixes to trigger commit

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
    hike-store.ts       # localStorage read/write, trail constants, CSV export
    trail-markers.ts    # per-marker lookup (incl. lat/lng), snap-to-trail, neighbour interpolation
    trail-gpx.ts        # ~240 GPS points defining the master trail route
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
MAX_MARKERS = 50           // how many markers on the new trail
TRAIL_DISTANCE_KM = 2.52   // total trail distance in km
TRAIL_ELEVATION_GAIN = 796 // total elevation gain in meters
TRAIL_BASE_ELEVATION = 297 // elevation at trailhead in meters ASL
```

Also update the localStorage key names (`bcmc-hike-attempts`, `bcmc-active-hike`, `bcmc-marker-gps`) so old data does not bleed into the new trail.

### Step 2 — Replace the marker table

File: `src/lib/trail-markers.ts`

Replace the `MARKER_TABLE` array. Each entry needs:

```ts
{ marker: 5, lat: 49.3714, lng: -123.0927, elevation: 422.3,
  elevationPct: 15.8, distanceM: 488.0, distancePct: 19.3 }
```

- `marker` — the physical marker number on trail
- `lat` / `lng` — marker GPS position (used by auto-tracking to arm the approach zone)
- `distanceM` — meters from start
- `elevation` — meters ASL
- `elevationPct` / `distancePct` — percentage of total gain / distance (0–100)

First entry must be marker 0 (trailhead). Last entry must be the finish marker. Markers with no field data can be omitted — auto-tracking falls back to Manual mode for the missing marker, and progress is either snapped to the master trail (accurate GPS) or interpolated between neighbours (no GPS).

### Step 3 — Replace the GPS route

File: `src/lib/trail-gpx.ts`

Replace the `TRAIL_ROUTE` array with points from your GPX file:

```ts
{ lat: 49.3711, lng: -123.0996, ele: 296.9 }
```

Export a GPX from AllTrails, Strava, or Gaia GPS. Parse it into this format. ~100–250 points is enough. For best snap-to-trail behaviour in Manual mode, interleave the marker positions into the route so they appear as vertices.

### Step 4 — Regenerate contour map

Run:

```bash
node scripts/build-contours.mjs
```

This fetches DEM tiles for the trail area and writes `public/bcmc-contours.svg`. Update the lat/lng bounds inside the script to match the new trail before running.

### Step 5 — Update UI text

- `index.html` — page title and og:description
- `src/components/ActiveHike.tsx` — trail name, distance, elevation, and finish-line instructions shown on the start screen. Auto-tracking tunables also live near the top of this file:
  - `GPS_ACCURACY_MAX_M` — above this, Auto mode falls back to Manual (default 30 m)
  - `APPROACH_RADIUS_MIN_M` / `APPROACH_RADIUS_ACCURACY_FACTOR` — radius of the approach zone (default `max(15 m, accuracy × 1.5)`)
  - `EXIT_INCREASING_FIXES` — consecutive rising-distance fixes needed to commit the auto split (default 2)
