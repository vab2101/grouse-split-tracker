// BCMC Trail marker data from bcmc_markers.csv.
// Missing markers (31, 33, 44, 45) are omitted — auto-tracking falls back to Manual mode when the next marker is missing.

import { TRAIL_ROUTE } from "@/lib/trail-gpx";

export interface MarkerProgress {
  marker: number;
  elevationPct: number;
  distancePct: number;
  distanceM: number;
  elevation: number;
}

export interface MarkerPosition {
  marker: number;
  lat: number;
  lng: number;
  elevation: number;
}

export interface MarkerRecord extends MarkerProgress, MarkerPosition {}

const MARKER_TABLE: readonly MarkerRecord[] = [
  { marker:  0, lat: 49.3711800, lng: -123.0983900, elevation:  296.90, elevationPct:  0.00, distanceM:    0.00, distancePct:  0.00 },
  { marker:  1, lat: 49.3706139, lng: -123.0946675, elevation:  351.50, elevationPct:  6.90, distanceM:  307.20, distancePct: 12.20 },
  { marker:  2, lat: 49.3708537, lng: -123.0941840, elevation:  367.60, elevationPct:  8.90, distanceM:  352.50, distancePct: 14.00 },
  { marker:  3, lat: 49.3711047, lng: -123.0937164, elevation:  384.90, elevationPct: 11.10, distanceM:  397.30, distancePct: 15.70 },
  { marker:  4, lat: 49.3714393, lng: -123.0931035, elevation:  407.40, elevationPct: 13.90, distanceM:  458.20, distancePct: 18.20 },
  { marker:  5, lat: 49.3713960, lng: -123.0927432, elevation:  422.30, elevationPct: 15.80, distanceM:  488.00, distancePct: 19.30 },
  { marker:  6, lat: 49.3715279, lng: -123.0924548, elevation:  442.80, elevationPct: 18.30, distanceM:  522.70, distancePct: 20.70 },
  { marker:  7, lat: 49.3718223, lng: -123.0920272, elevation:  466.10, elevationPct: 21.30, distanceM:  572.30, distancePct: 22.70 },
  { marker:  8, lat: 49.3719756, lng: -123.0916232, elevation:  485.50, elevationPct: 23.70, distanceM:  610.80, distancePct: 24.20 },
  { marker:  9, lat: 49.3718193, lng: -123.0911866, elevation:  510.00, elevationPct: 26.80, distanceM:  652.80, distancePct: 25.90 },
  { marker: 10, lat: 49.3719229, lng: -123.0908019, elevation:  525.70, elevationPct: 28.70, distanceM:  697.00, distancePct: 27.60 },
  { marker: 11, lat: 49.3721338, lng: -123.0904371, elevation:  547.60, elevationPct: 31.50, distanceM:  737.20, distancePct: 29.20 },
  { marker: 12, lat: 49.3720595, lng: -123.0899075, elevation:  569.90, elevationPct: 34.30, distanceM:  784.40, distancePct: 31.10 },
  { marker: 13, lat: 49.3718195, lng: -123.0894698, elevation:  597.00, elevationPct: 37.70, distanceM:  829.80, distancePct: 32.90 },
  { marker: 14, lat: 49.3715278, lng: -123.0891189, elevation:  612.00, elevationPct: 39.60, distanceM:  877.50, distancePct: 34.80 },
  { marker: 15, lat: 49.3715618, lng: -123.0886921, elevation:  636.50, elevationPct: 42.70, distanceM:  918.70, distancePct: 36.40 },
  { marker: 16, lat: 49.3714421, lng: -123.0883777, elevation:  650.60, elevationPct: 44.40, distanceM:  960.40, distancePct: 38.10 },
  { marker: 17, lat: 49.3717655, lng: -123.0882237, elevation:  667.60, elevationPct: 46.60, distanceM: 1003.20, distancePct: 39.80 },
  { marker: 18, lat: 49.3719952, lng: -123.0876641, elevation:  695.10, elevationPct: 50.00, distanceM: 1085.10, distancePct: 43.00 },
  { marker: 19, lat: 49.3717049, lng: -123.0873637, elevation:  707.70, elevationPct: 51.60, distanceM: 1125.10, distancePct: 44.60 },
  { marker: 20, lat: 49.3715098, lng: -123.0868588, elevation:  725.80, elevationPct: 53.90, distanceM: 1171.50, distancePct: 46.40 },
  { marker: 21, lat: 49.3717481, lng: -123.0866563, elevation:  743.20, elevationPct: 56.10, distanceM: 1204.10, distancePct: 47.70 },
  { marker: 22, lat: 49.3720624, lng: -123.0863070, elevation:  759.10, elevationPct: 58.10, distanceM: 1254.60, distancePct: 49.70 },
  { marker: 23, lat: 49.3720225, lng: -123.0857770, elevation:  770.10, elevationPct: 59.40, distanceM: 1302.60, distancePct: 51.60 },
  { marker: 24, lat: 49.3718588, lng: -123.0851659, elevation:  795.00, elevationPct: 62.60, distanceM: 1353.00, distancePct: 53.60 },
  { marker: 25, lat: 49.3719065, lng: -123.0847969, elevation:  811.50, elevationPct: 64.60, distanceM: 1388.90, distancePct: 55.10 },
  { marker: 26, lat: 49.3719323, lng: -123.0844409, elevation:  832.40, elevationPct: 67.30, distanceM: 1419.00, distancePct: 56.20 },
  { marker: 27, lat: 49.3717640, lng: -123.0839512, elevation:  839.70, elevationPct: 68.20, distanceM: 1468.60, distancePct: 58.20 },
  { marker: 28, lat: 49.3719516, lng: -123.0833497, elevation:  860.10, elevationPct: 70.80, distanceM: 1525.30, distancePct: 60.50 },
  { marker: 29, lat: 49.3721778, lng: -123.0831412, elevation:  877.00, elevationPct: 72.90, distanceM: 1578.00, distancePct: 62.60 },
  { marker: 30, lat: 49.3728169, lng: -123.0831375, elevation:  901.50, elevationPct: 76.00, distanceM: 1684.20, distancePct: 66.80 },
  { marker: 32, lat: 49.3733984, lng: -123.0826277, elevation:  924.40, elevationPct: 78.80, distanceM: 1768.20, distancePct: 70.10 },
  { marker: 34, lat: 49.3738266, lng: -123.0820119, elevation:  953.30, elevationPct: 82.50, distanceM: 1845.50, distancePct: 73.20 },
  { marker: 35, lat: 49.3740879, lng: -123.0815858, elevation:  963.60, elevationPct: 83.80, distanceM: 1888.20, distancePct: 74.80 },
  { marker: 36, lat: 49.3744649, lng: -123.0815849, elevation:  982.10, elevationPct: 86.10, distanceM: 1930.90, distancePct: 76.50 },
  { marker: 37, lat: 49.3749397, lng: -123.0814228, elevation:  984.80, elevationPct: 86.40, distanceM: 1986.20, distancePct: 78.70 },
  { marker: 38, lat: 49.3752023, lng: -123.0813992, elevation: 1007.10, elevationPct: 89.20, distanceM: 2016.10, distancePct: 79.90 },
  { marker: 39, lat: 49.3755467, lng: -123.0813049, elevation: 1015.40, elevationPct: 90.30, distanceM: 2057.50, distancePct: 81.60 },
  { marker: 40, lat: 49.3759351, lng: -123.0813898, elevation: 1019.00, elevationPct: 90.70, distanceM: 2101.40, distancePct: 83.30 },
  { marker: 41, lat: 49.3762689, lng: -123.0815946, elevation: 1026.00, elevationPct: 91.60, distanceM: 2144.00, distancePct: 85.00 },
  { marker: 42, lat: 49.3766188, lng: -123.0817550, elevation: 1033.80, elevationPct: 92.60, distanceM: 2184.70, distancePct: 86.60 },
  { marker: 43, lat: 49.3770459, lng: -123.0817201, elevation: 1043.30, elevationPct: 93.80, distanceM: 2232.70, distancePct: 88.50 },
  { marker: 46, lat: 49.3780026, lng: -123.0825514, elevation: 1058.20, elevationPct: 95.60, distanceM: 2367.40, distancePct: 93.80 },
  { marker: 47, lat: 49.3780342, lng: -123.0828873, elevation: 1055.80, elevationPct: 95.30, distanceM: 2395.60, distancePct: 95.00 },
  { marker: 48, lat: 49.3783710, lng: -123.0829336, elevation: 1068.40, elevationPct: 96.90, distanceM: 2444.90, distancePct: 96.90 },
  { marker: 49, lat: 49.3785606, lng: -123.0831039, elevation: 1076.20, elevationPct: 97.90, distanceM: 2469.30, distancePct: 97.90 },
  { marker: 50, lat: 49.3788265, lng: -123.0833036, elevation: 1082.10, elevationPct: 98.60, distanceM: 2506.60, distancePct: 99.40 },
  { marker: 51, lat: 49.3789700, lng: -123.0833000, elevation: 1092.90, elevationPct: 100.00, distanceM: 2522.80, distancePct: 100.00 },
];

const MARKER_BY_NUM = new Map<number, MarkerRecord>(MARKER_TABLE.map((m) => [m.marker, m]));

export const TRAIL_TOTAL_DISTANCE_M = 2522.8;
export const TRAIL_TOTAL_ELEVATION_GAIN = 796.0;
export const TRAIL_BASE_ELEV = 296.9;

/** Is a marker number missing from the dataset (forces Manual mode). */
export function isMarkerMissing(marker: number): boolean {
  return !MARKER_BY_NUM.has(marker);
}

/** Known GPS position for a marker, or null if missing. */
export function getMarkerPosition(marker: number): MarkerPosition | null {
  const rec = MARKER_BY_NUM.get(marker);
  return rec ? { marker, lat: rec.lat, lng: rec.lng, elevation: rec.elevation } : null;
}

/**
 * Walks backward to the nearest marker with data. Preserves prior behaviour.
 */
export function getProgressForMarker(lastTapped: number): MarkerProgress {
  for (let m = lastTapped; m >= 0; m--) {
    const rec = MARKER_BY_NUM.get(m);
    if (rec) return rec;
  }
  return MARKER_TABLE[0];
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { haversineM };

// Pre-compute cumulative master-trail distances (haversine-based, for snap-to-trail).
const MASTER_CUM_M: number[] = [0];
for (let i = 1; i < TRAIL_ROUTE.length; i++) {
  const p = TRAIL_ROUTE[i - 1];
  const q = TRAIL_ROUTE[i];
  MASTER_CUM_M.push(MASTER_CUM_M[i - 1] + haversineM(p.lat, p.lng, q.lat, q.lng));
}
const MASTER_TOTAL_M = MASTER_CUM_M[MASTER_CUM_M.length - 1];
// Scale master-trail distances to match marker CSV total (2522.8 m). Small mismatch otherwise.
const MASTER_SCALE = TRAIL_TOTAL_DISTANCE_M / MASTER_TOTAL_M;

/**
 * Snap a live GPS position to the closest master-trail vertex.
 * Returns progress (scaled to marker-CSV total) and elevation of that vertex.
 */
export function snapToMasterTrail(lat: number, lng: number): MarkerProgress {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < TRAIL_ROUTE.length; i++) {
    const d = haversineM(lat, lng, TRAIL_ROUTE[i].lat, TRAIL_ROUTE[i].lng);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  const distanceM = MASTER_CUM_M[bestIdx] * MASTER_SCALE;
  const elevation = TRAIL_ROUTE[bestIdx].ele;
  return {
    marker: -1,
    distanceM,
    distancePct: (distanceM / TRAIL_TOTAL_DISTANCE_M) * 100,
    elevation,
    elevationPct: ((elevation - TRAIL_BASE_ELEV) / TRAIL_TOTAL_ELEVATION_GAIN) * 100,
  };
}

/**
 * Interpolate progress for a missing marker from its nearest-neighbour known markers.
 * Used when GPS is unavailable and the marker has no known position.
 */
export function interpolateMarkerProgress(marker: number): MarkerProgress {
  let prev: MarkerRecord | null = null;
  for (let m = marker - 1; m >= 0; m--) {
    const r = MARKER_BY_NUM.get(m);
    if (r) { prev = r; break; }
  }
  let next: MarkerRecord | null = null;
  for (let m = marker + 1; m <= 51; m++) {
    const r = MARKER_BY_NUM.get(m);
    if (r) { next = r; break; }
  }
  if (!prev && !next) return MARKER_TABLE[0];
  if (!prev) return next!;
  if (!next) return prev;
  const span = next.marker - prev.marker;
  const t = (marker - prev.marker) / span;
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    marker,
    distanceM: lerp(prev.distanceM, next.distanceM),
    distancePct: lerp(prev.distancePct, next.distancePct),
    elevation: lerp(prev.elevation, next.elevation),
    elevationPct: lerp(prev.elevationPct, next.elevationPct),
  };
}
