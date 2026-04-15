// Shared geographic bounds + projection for the BCMC trail SVG rendering.
// Used by both the build script (scripts/build-contours.mjs) and the runtime
// MapBackground component, so the contour SVG and the trail polyline align in
// the exact same SVG coordinate space.

import { TRAIL_ROUTE } from "./trail-gpx";

// Pad the geographic bbox slightly past the trail so contour lines extend
// naturally beyond the route. Degrees ~ 1° lat ≈ 111 km, so 0.0008° ≈ 90 m.
const LAT_PAD = 0.0008;
const LNG_PAD = 0.0012;

const LATS = TRAIL_ROUTE.map((p) => p.lat);
const LNGS = TRAIL_ROUTE.map((p) => p.lng);

export const TRAIL_GEO_BOUNDS = {
  minLat: Math.min(...LATS) - LAT_PAD,
  maxLat: Math.max(...LATS) + LAT_PAD,
  minLng: Math.min(...LNGS) - LNG_PAD,
  maxLng: Math.max(...LNGS) + LNG_PAD,
};

const MID_LAT = (TRAIL_GEO_BOUNDS.minLat + TRAIL_GEO_BOUNDS.maxLat) / 2;
const COS_MID_LAT = Math.cos((MID_LAT * Math.PI) / 180);

// SVG viewBox: locked aspect ratio = bbox in metres-equivalent, so trail
// shape isn't distorted. Width = lng-span * cos(midLat), height = lat-span.
// Multiply by a constant so we have nice integer-ish numbers in the viewBox.
const SCALE = 100000;

export const SVG_VIEW = {
  width: (TRAIL_GEO_BOUNDS.maxLng - TRAIL_GEO_BOUNDS.minLng) * COS_MID_LAT * SCALE,
  height: (TRAIL_GEO_BOUNDS.maxLat - TRAIL_GEO_BOUNDS.minLat) * SCALE,
};

/** Project (lng, lat) → SVG (x, y). Origin at top-left, y grows downward. */
export function project(lng: number, lat: number): [number, number] {
  const x = (lng - TRAIL_GEO_BOUNDS.minLng) * COS_MID_LAT * SCALE;
  const y = (TRAIL_GEO_BOUNDS.maxLat - lat) * SCALE;
  return [x, y];
}
