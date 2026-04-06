

## Update Trail Stats from Official Grouse Mountain Data

The current codebase uses estimated values (2.5 km, 853m gain). Grouse Mountain's official BCMC page states different numbers.

### Official stats from grousemountain.com/BCMC

| Stat | Current (wrong) | Official (correct) |
|------|-----------------|-------------------|
| Trail length | 2.5 km | 2.9 km |
| Elevation gain | 853 m | 750 m |

The base elevation (~290m at the trailhead) is reasonable and not contradicted by official data. With 750m gain, the top would be ~1,040m rather than ~1,128m.

### Changes

**`src/lib/hike-store.ts`**
- Update comment on line 2 to reflect official stats: 750m gain over 2.9 km
- Add exported constants: `TRAIL_DISTANCE_KM = 2.9`, `TRAIL_ELEVATION_GAIN = 750`, `TRAIL_BASE_ELEVATION = 290`

**`src/components/ActiveHike.tsx`**
- Update the pre-start screen text from "2.5 km · 853m elevation" to "2.9 km · 750m elevation gain"
- Replace the current single elevation line in the sticky header with two progress lines per Issue #1:
  - Line 1: `{Ec} m / 750 m ({Ep}%)` — elevation progress based on `currentAltitude - 290`
  - Line 2: `{Dc} km / 2.9 km ({Dp}%)` — distance estimated proportionally from elevation progress
- Add GPS accuracy indicator (satellite icon, color-coded) per Issue #5

### Technical details

- Elevation gain: `Ec = max(0, currentAltitude - TRAIL_BASE_ELEVATION)`, capped at `TRAIL_ELEVATION_GAIN`
- Distance estimate: `Dc = TRAIL_DISTANCE_KM * (Ec / TRAIL_ELEVATION_GAIN)`, capped at `TRAIL_DISTANCE_KM`
- GPS accuracy colors: green (≤10m), yellow (≤25m), red (>25m)
- Formatting: meters as whole numbers, km to 1 decimal, percentages as whole numbers

