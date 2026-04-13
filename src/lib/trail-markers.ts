// Pre-measured BCMC trail marker data from CSV.
// Markers with Insufficient Data = TRUE are omitted; getProgressForMarker() walks
// backwards to the nearest marker that does have data.

export interface MarkerProgress {
  marker: number; // 0–50, or 51 for the finish
  elevationPct: number; // 0–100
  distancePct: number; // 0–100
  distanceM: number; // metres from trailhead
  elevation: number; // metres ASL
}

const MARKER_TABLE: readonly MarkerProgress[] = [
  { marker:  0, elevationPct:   0.0, distancePct:   0.0, distanceM:    0.0, elevation:  296.9 },
  { marker:  3, elevationPct:  11.0, distancePct:  16.9, distanceM:  398.5, elevation:  384.4 },
  { marker:  4, elevationPct:  15.1, distancePct:  19.5, distanceM:  459.0, elevation:  417.3 },
  { marker:  5, elevationPct:  17.3, distancePct:  20.6, distanceM:  485.3, elevation:  434.8 },
  { marker:  8, elevationPct:  25.9, distancePct:  25.7, distanceM:  606.5, elevation:  503.3 },
  { marker: 12, elevationPct:  35.2, distancePct:  32.7, distanceM:  771.6, elevation:  577.3 },
  { marker: 13, elevationPct:  38.1, distancePct:  34.5, distanceM:  812.8, elevation:  600.2 },
  { marker: 14, elevationPct:  41.3, distancePct:  36.4, distanceM:  858.0, elevation:  625.3 },
  { marker: 15, elevationPct:  44.1, distancePct:  38.0, distanceM:  894.5, elevation:  648.1 },
  { marker: 16, elevationPct:  46.3, distancePct:  39.4, distanceM:  929.6, elevation:  665.7 },
  { marker: 17, elevationPct:  47.9, distancePct:  41.0, distanceM:  967.3, elevation:  678.1 },
  { marker: 18, elevationPct:  51.5, distancePct:  44.5, distanceM: 1048.3, elevation:  707.2 },
  { marker: 19, elevationPct:  53.4, distancePct:  46.2, distanceM: 1088.5, elevation:  722.2 },
  { marker: 20, elevationPct:  55.5, distancePct:  48.2, distanceM: 1135.0, elevation:  739.1 },
  { marker: 21, elevationPct:  57.2, distancePct:  49.6, distanceM: 1168.4, elevation:  752.0 },
  { marker: 22, elevationPct:  59.7, distancePct:  51.6, distanceM: 1216.4, elevation:  771.9 },
  { marker: 24, elevationPct:  65.3, distancePct:  55.6, distanceM: 1310.7, elevation:  816.4 },
  { marker: 25, elevationPct:  67.4, distancePct:  57.2, distanceM: 1347.6, elevation:  833.0 },
  { marker: 26, elevationPct:  68.7, distancePct:  58.3, distanceM: 1372.9, elevation:  843.9 },
  { marker: 27, elevationPct:  70.4, distancePct:  59.8, distanceM: 1410.5, elevation:  857.3 },
  { marker: 28, elevationPct:  72.1, distancePct:  61.3, distanceM: 1443.7, elevation:  870.7 },
  { marker: 29, elevationPct:  73.3, distancePct:  62.1, distanceM: 1462.4, elevation:  880.1 },
  { marker: 30, elevationPct:  77.4, distancePct:  66.0, distanceM: 1554.6, elevation:  913.4 },
  { marker: 32, elevationPct:  80.5, distancePct:  69.6, distanceM: 1640.3, elevation:  937.5 },
  { marker: 34, elevationPct:  83.5, distancePct:  72.8, distanceM: 1715.5, elevation:  961.3 },
  { marker: 36, elevationPct:  86.4, distancePct:  76.3, distanceM: 1798.7, elevation:  984.8 },
  { marker: 38, elevationPct:  89.3, distancePct:  79.9, distanceM: 1883.5, elevation: 1008.1 },
  { marker: 39, elevationPct:  90.4, distancePct:  81.7, distanceM: 1924.7, elevation: 1016.5 },
  { marker: 40, elevationPct:  91.3, distancePct:  83.5, distanceM: 1967.1, elevation: 1023.8 },
  { marker: 41, elevationPct:  92.3, distancePct:  85.2, distanceM: 2007.7, elevation: 1032.0 },
  { marker: 42, elevationPct:  93.5, distancePct:  86.9, distanceM: 2048.0, elevation: 1041.0 },
  { marker: 43, elevationPct:  94.9, distancePct:  89.0, distanceM: 2096.4, elevation: 1051.9 },
  { marker: 46, elevationPct:  97.2, distancePct:  94.7, distanceM: 2232.3, elevation: 1070.4 },
  { marker: 47, elevationPct:  97.5, distancePct:  95.3, distanceM: 2245.6, elevation: 1073.0 },
  { marker: 48, elevationPct:  98.3, distancePct:  96.7, distanceM: 2277.9, elevation: 1079.5 },
  { marker: 49, elevationPct:  99.0, distancePct:  97.8, distanceM: 2305.3, elevation: 1084.8 },
  { marker: 50, elevationPct:  99.7, distancePct:  99.3, distanceM: 2340.7, elevation: 1090.4 },
  { marker: 51, elevationPct: 100.0, distancePct: 100.0, distanceM: 2356.7, elevation: 1092.9 },
];

/**
 * Returns the progress data for the last tapped marker.
 * If that marker has no data (Insufficient Data = TRUE in the CSV),
 * walks backwards until it finds one that does.
 */
export function getProgressForMarker(lastTapped: number): MarkerProgress {
  for (let m = lastTapped; m >= 0; m--) {
    for (let i = 0; i < MARKER_TABLE.length; i++) {
      if (MARKER_TABLE[i].marker === m) return MARKER_TABLE[i];
    }
  }
  return MARKER_TABLE[0];
}
