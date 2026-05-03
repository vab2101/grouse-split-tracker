import type {
  GpxPoint,
  MarkerRecord,
  MarkerProgress,
  MarkerPosition,
  Trail,
  TrailId,
  GeoBounds,
  MapTransform,
} from "./trail-types";
import {
  haversineM,
  LAT_PAD,
  LNG_PAD,
  CONTOUR_EXTRA_LAT,
  CONTOUR_EXTRA_LNG,
  SVG_PROJECT_SCALE,
} from "./trail-types";
import { BCMC_ROUTE, BCMC_RAW_MARKERS, BCMC_TRANSFORM, BCMC_CONTOUR_IMAGE } from "./trail-data-bcmc";
import { GRIND_ROUTE, GRIND_RAW_MARKERS, GRIND_TRANSFORM, GRIND_CONTOUR_IMAGE } from "./trail-data-grind";

interface BuildOpts {
  id: TrailId;
  name: string;
  fullName: string;
  finishMarker: number;
  route: readonly GpxPoint[];
  rawMarkers: readonly { marker: number; lat: number; lng: number; elevation: number }[];
  contourImageUrl: string;
  transform: MapTransform;
}

function computeBounds(route: readonly GpxPoint[]): GeoBounds {
  const lats = route.map((p) => p.lat);
  const lngs = route.map((p) => p.lng);
  return {
    minLat: Math.min(...lats) - LAT_PAD,
    maxLat: Math.max(...lats) + LAT_PAD,
    minLng: Math.min(...lngs) - LNG_PAD,
    maxLng: Math.max(...lngs) + LNG_PAD,
  };
}

function buildTrail(opts: BuildOpts): Trail {
  const { route } = opts;

  // Cumulative distances along route.
  const masterCumM: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    masterCumM.push(masterCumM[i - 1] + haversineM(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng));
  }
  const totalDistanceM = masterCumM[masterCumM.length - 1];
  const masterScale = 1; // route haversine == official total — no scaling.

  // Elevation extremes from route.
  const eles = route.map((p) => p.ele);
  const baseElevation = eles[0];
  const elevationGain = Math.max(...eles) - Math.min(...eles);

  // Bounds + projection (per trail, not shared).
  const geoBounds = computeBounds(route);
  const midLat = (geoBounds.minLat + geoBounds.maxLat) / 2;
  const cosMid = Math.cos((midLat * Math.PI) / 180);
  const svgView = {
    width: (geoBounds.maxLng - geoBounds.minLng) * cosMid * SVG_PROJECT_SCALE,
    height: (geoBounds.maxLat - geoBounds.minLat) * SVG_PROJECT_SCALE,
  };
  const contourPadX = CONTOUR_EXTRA_LNG * cosMid * SVG_PROJECT_SCALE;
  const contourPadY = CONTOUR_EXTRA_LAT * SVG_PROJECT_SCALE;
  const contourView = {
    x: -contourPadX,
    y: -contourPadY,
    width: svgView.width + 2 * contourPadX,
    height: svgView.height + 2 * contourPadY,
  };
  const project = (lng: number, lat: number): [number, number] => [
    (lng - geoBounds.minLng) * cosMid * SVG_PROJECT_SCALE,
    (geoBounds.maxLat - lat) * SVG_PROJECT_SCALE,
  ];

  // Markers via projection onto route polyline (nearest-vertex).
  const markers: MarkerRecord[] = opts.rawMarkers.map((m) => {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < route.length; i++) {
      const d = haversineM(m.lat, m.lng, route[i].lat, route[i].lng);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    const distanceM = masterCumM[bestIdx];
    return {
      marker: m.marker,
      lat: m.lat,
      lng: m.lng,
      elevation: m.elevation,
      distanceM,
      distancePct: totalDistanceM > 0 ? (distanceM / totalDistanceM) * 100 : 0,
      elevationPct: elevationGain > 0 ? ((m.elevation - baseElevation) / elevationGain) * 100 : 0,
    };
  });
  // Clamp to monotonic distance (projection can backtrack on switchbacks).
  let runMax = 0;
  for (const m of markers) {
    if (m.distanceM < runMax) {
      m.distanceM = runMax;
      m.distancePct = totalDistanceM > 0 ? (runMax / totalDistanceM) * 100 : 0;
    } else {
      runMax = m.distanceM;
    }
  }

  return {
    id: opts.id,
    name: opts.name,
    fullName: opts.fullName,
    distanceKm: totalDistanceM / 1000,
    totalDistanceM,
    elevationGain,
    baseElevation,
    maxMarkers: opts.finishMarker - 1,
    finishMarker: opts.finishMarker,
    route,
    markers,
    markersByNum: new Map(markers.map((m) => [m.marker, m])),
    masterCumM,
    masterScale,
    geoBounds,
    svgView,
    contourView,
    project,
    contourImageUrl: opts.contourImageUrl,
    transform: opts.transform,
  };
}

export const BCMC_TRAIL: Trail = buildTrail({
  id: "bcmc",
  name: "BCMC",
  fullName: "BCMC Trail",
  finishMarker: 51,
  route: BCMC_ROUTE,
  rawMarkers: BCMC_RAW_MARKERS,
  contourImageUrl: BCMC_CONTOUR_IMAGE,
  transform: BCMC_TRANSFORM,
});

export const GRIND_TRAIL: Trail = buildTrail({
  id: "grind",
  name: "GRIND",
  fullName: "Grouse Grind",
  finishMarker: 41,
  route: GRIND_ROUTE,
  rawMarkers: GRIND_RAW_MARKERS,
  contourImageUrl: GRIND_CONTOUR_IMAGE,
  transform: GRIND_TRANSFORM,
});

export const TRAILS: Record<TrailId, Trail> = {
  bcmc: BCMC_TRAIL,
  grind: GRIND_TRAIL,
};

export const DEFAULT_TRAIL_ID: TrailId = "bcmc";

export function getTrail(id: TrailId | undefined): Trail {
  return TRAILS[id ?? DEFAULT_TRAIL_ID] ?? BCMC_TRAIL;
}

export function isTrailId(s: unknown): s is TrailId {
  return s === "bcmc" || s === "grind";
}

// ── Per-trail helpers ────────────────────────────────────────────────────────

export function isMarkerMissing(trail: Trail, marker: number): boolean {
  return !trail.markersByNum.has(marker);
}

export function getMarkerPosition(trail: Trail, marker: number): MarkerPosition | null {
  const rec = trail.markersByNum.get(marker);
  return rec ? { marker, lat: rec.lat, lng: rec.lng, elevation: rec.elevation } : null;
}

export function getProgressForMarker(trail: Trail, lastTapped: number): MarkerProgress {
  for (let m = lastTapped; m >= 0; m--) {
    const rec = trail.markersByNum.get(m);
    if (rec) return rec;
  }
  return trail.markers[0] ?? {
    marker: 0,
    distanceM: 0,
    distancePct: 0,
    elevation: trail.baseElevation,
    elevationPct: 0,
  };
}

export function snapToMasterTrail(trail: Trail, lat: number, lng: number): MarkerProgress {
  let bestIdx = 0;
  let bestD = Infinity;
  for (let i = 0; i < trail.route.length; i++) {
    const d = haversineM(lat, lng, trail.route[i].lat, trail.route[i].lng);
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  const distanceM = trail.masterCumM[bestIdx];
  const elevation = trail.route[bestIdx].ele;
  return {
    marker: -1,
    distanceM,
    distancePct: trail.totalDistanceM > 0 ? (distanceM / trail.totalDistanceM) * 100 : 0,
    elevation,
    elevationPct: trail.elevationGain > 0 ? ((elevation - trail.baseElevation) / trail.elevationGain) * 100 : 0,
  };
}

export function interpolateMarkerProgress(trail: Trail, marker: number): MarkerProgress {
  let prev: MarkerRecord | null = null;
  for (let m = marker - 1; m >= 0; m--) {
    const r = trail.markersByNum.get(m);
    if (r) { prev = r; break; }
  }
  let next: MarkerRecord | null = null;
  for (let m = marker + 1; m <= trail.finishMarker; m++) {
    const r = trail.markersByNum.get(m);
    if (r) { next = r; break; }
  }
  if (!prev && !next) return trail.markers[0];
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

export { haversineM };
export type { GpxPoint, MarkerRecord, MarkerProgress, MarkerPosition, Trail, TrailId };
