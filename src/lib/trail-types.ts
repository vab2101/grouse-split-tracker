export interface GpxPoint {
  lat: number;
  lng: number;
  ele: number;
}

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

export type TrailId = "bcmc" | "grind";

export interface GeoBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface SvgRect {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface MapTransform {
  shiftX: number;
  shiftY: number;
  extraScale: number;
  rotateDeg: number;
}

export interface Trail {
  id: TrailId;
  name: string;
  fullName: string;
  distanceKm: number;
  totalDistanceM: number;
  elevationGain: number;
  baseElevation: number;
  maxMarkers: number;
  finishMarker: number;
  route: readonly GpxPoint[];
  markers: readonly MarkerRecord[];
  markersByNum: ReadonlyMap<number, MarkerRecord>;
  // Cumulative distance along route in metres at each route vertex; final entry == totalDistanceM.
  masterCumM: readonly number[];
  masterScale: number;
  // Geographic bounds (with a tight pad) used as the SVG projection origin.
  geoBounds: GeoBounds;
  // SVG viewBox dims for the trail polyline.
  svgView: { width: number; height: number };
  // Larger SVG viewBox covering the contour image (extends past trail bbox).
  contourView: { x: number; y: number; width: number; height: number };
  // Projects (lng, lat) to this trail's SVG coord space.
  project: (lng: number, lat: number) => [number, number];
  // Public path of the pre-baked contour SVG for this trail (e.g. "/bcmc-contours.svg").
  contourImageUrl: string;
  // Map background transform tuned via /mockup.html.
  transform: MapTransform;
}

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Shared trail-bounds constants — kept here so build-contours.mjs and runtime stay in sync ──

export const LAT_PAD = 0.0008;
export const LNG_PAD = 0.0012;
export const CONTOUR_EXTRA_LAT = 0.009;
export const CONTOUR_EXTRA_LNG = 0.009;
export const SVG_PROJECT_SCALE = 100000;
