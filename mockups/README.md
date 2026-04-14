# Background-map mockups

Two standalone HTML mockups exploring a design where the trail map becomes the
background of the Active Hike screen, with contour-line topography and a
translucent central marker button.

Open either file directly in a modern browser (double-click, or
`open mockups/mockup-a-topo.html` on macOS). They are desktop-friendly (rendered
inside a centered phone frame) and fit a real phone viewport when loaded on a
device or Chrome DevTools' responsive mode (iPhone 14 / 393×852).

## Files

| File | Background | Contour source |
| --- | --- | --- |
| `mockup-a-topo.html` | Full [OpenTopoMap](https://opentopomap.org) raster tiles — baked-in contours, hillshading and labels | OpenTopoMap tile server (CC-BY-SA · OSM contributors) |
| `mockup-b-contours.html` | Minimal dark canvas with just contour lines, matching the app's dark theme | [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) (Terrarium DEM) rendered client-side by [maplibre-contour](https://github.com/onthegomap/maplibre-contour) |

Shared assets:
- `_shared.css` — colors pulled from `src/index.css`, phone-frame layout, button + sparkline styling
- `_shared.js` — BCMC trail GPX data (copied from `src/lib/trail-gpx.ts`), Lucide icons, elevation-sparkline renderer, chrome-builder

## Design intent (for both mockups)

- Map fills the full middle region of the screen behind the "Tap at marker"
  button. Opaque header (timer + stats) and opaque footer (Finish + lock)
  remain as before.
- The old two-column **Elevation** + **Route** sparkline pair from
  `TrailProgress.tsx` is collapsed into a single centered **Elevation** sparkline
  directly under the header — the 2D route is now the background map, so a
  separate route preview is redundant.
- Marker button uses `backdrop-filter: blur(6px)` with a 18% green fill, so the
  map reads through without the number/icon losing contrast. A soft radial
  vignette (`.map-vignette`) dims the map where the button sits.
- `map.fitBounds(...)` is called with heavy **bottom padding** so the BCMC
  zig-zag sits in the upper portion of the visible map area, keeping the
  vertical center clear and preventing the trail polyline from passing behind
  the button.

## Dependencies (all pulled from CDN, no install)

- [MapLibre GL JS 4.7.1](https://maplibre.org/) (`unpkg.com/maplibre-gl`)
- [maplibre-contour 0.0.6](https://github.com/onthegomap/maplibre-contour) — mockup B only
- Google Fonts: Inter, JetBrains Mono (matches the production app)
- Icons: inlined Lucide SVG paths — no runtime icon dependency

An internet connection is required to load tiles and fonts. Offline, the UI
chrome stays intact but the map area will show a blank background — acceptable
for preview purposes.

## Next step

Once a direction is picked, the production implementation will live in
`src/components/ActiveHike.tsx` (chrome layout + translucent button) and
`src/components/TrailProgress.tsx` (single centered elevation sparkline), with
a new `MapBackground` React component wrapping MapLibre + the chosen tile /
contour source.
