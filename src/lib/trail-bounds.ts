// Shared geographic bounds + projection for the BCMC trail SVG rendering.
// Used by both the build script (scripts/build-contours.mjs) and the runtime
// MapBackground component, so the contour SVG and the trail polyline align in
// the exact same SVG coordinate space.

import { TRAIL_ROUTE } from "./trail-gpx";

// Tight pad around the trail for the trail's own SVG viewBox. This keeps
// the trail rendering scale tied to the actual route geometry so zooming
// the viewport makes the trail as large as possible.
const LAT_PAD = 0.0008;
const LNG_PAD = 0.0012;

// Extra pad for the CONTOUR map so it covers a region much larger than the
// trail bbox. This lets MapBackground translate the scene (sliding the
// trail away from the centered marker button) without leaving blank strips
// of viewport uncovered by contour lines.
const CONTOUR_EXTRA_LAT = 0.009;
const CONTOUR_EXTRA_LNG = 0.009;

const LATS = TRAIL_ROUTE.map((p) => p.lat);
const LNGS = TRAIL_ROUTE.map((p) => p.lng);

export const TRAIL_GEO_BOUNDS = {
  minLat: Math.min(...LATS) - LAT_PAD,
  maxLat: Math.max(...LATS) + LAT_PAD,
  minLng: Math.min(...LNGS) - LNG_PAD,
  maxLng: Math.max(...LNGS) + LNG_PAD,
};

export const CONTOUR_GEO_BOUNDS = {
  minLat: Math.min(...LATS) - LAT_PAD - CONTOUR_EXTRA_LAT,
  maxLat: Math.max(...LATS) + LAT_PAD + CONTOUR_EXTRA_LAT,
  minLng: Math.min(...LNGS) - LNG_PAD - CONTOUR_EXTRA_LNG,
  maxLng: Math.max(...LNGS) + LNG_PAD + CONTOUR_EXTRA_LNG,
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

// The contour SVG's viewBox, expressed in the SAME SVG coordinate system as
// the trail (origin = TRAIL_GEO_BOUNDS top-left). It extends into negative
// x / y and past the trail's width / height by the contour pad amount.
const CONTOUR_PAD_X = CONTOUR_EXTRA_LNG * COS_MID_LAT * SCALE;
const CONTOUR_PAD_Y = CONTOUR_EXTRA_LAT * SCALE;

export const CONTOUR_VIEW = {
  x: -CONTOUR_PAD_X,
  y: -CONTOUR_PAD_Y,
  width: SVG_VIEW.width + 2 * CONTOUR_PAD_X,
  height: SVG_VIEW.height + 2 * CONTOUR_PAD_Y,
};

/** Project (lng, lat) → SVG (x, y). Origin at top-left, y grows downward. */
export function project(lng: number, lat: number): [number, number] {
  const x = (lng - TRAIL_GEO_BOUNDS.minLng) * COS_MID_LAT * SCALE;
  const y = (TRAIL_GEO_BOUNDS.maxLat - lat) * SCALE;
  return [x, y];
}
