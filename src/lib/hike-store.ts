import { DEFAULT_TRAIL_ID, isTrailId, getTrail, interpolateMarkerProgress, type TrailId } from "./trails";

// Legacy BCMC-only constants kept for any remaining call site that hasn't been migrated to
// per-trail values yet. New code should read these off the active Trail.
export const MAX_MARKERS = 50;
export const TRAIL_DISTANCE_KM = 2.52;
export const TRAIL_ELEVATION_GAIN = 796;
export const TRAIL_BASE_ELEVATION = 297;

export type SplitMode = "auto" | "manual";

export interface GpsCoord {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy?: number;
}

export interface Split {
  marker: number;
  timestamp: number; // ms since epoch
  elapsed: number; // ms since hike start
  elevation?: number;
  coords?: GpsCoord; // GPS location when marker was tapped
  skipped?: boolean; // true if marker was missed and retroactively inserted
  mode?: SplitMode; // logging mode used to create this split (hidden in UI, exported in CSV)
  // Progress override for Manual mode when the marker has no known position.
  // When present, UI uses these values instead of falling back to getProgressForMarker().
  progressOverride?: {
    distanceM: number;
    distancePct: number;
    elevation: number;
    elevationPct: number;
  };
}

export interface HikeTag {
  id: string;
  timestamp: number; // ms since epoch
  elapsed: number; // ms since hike start
  text: string;
  coords?: GpsCoord; // GPS where the tag was dropped; exported in CSV, not shown in UI
}

/**
 * Raw GPS fix captured during a hike. One row per accepted geolocation update
 * (throttled to ~1 Hz). Stored in HikeAttempt.gpsTrack for offline analysis +
 * future algorithm iterations (e.g. trail-aware filters, altitude fusion).
 *
 * All fields are optional/nullable to mirror what the Geolocation API exposes;
 * iOS Safari typically returns useful altitude/altitudeAccuracy when the
 * device has a barometer + GPS lock.
 */
export interface GpsFix {
  t: number;            // ms since hike start
  lat: number;
  lng: number;
  acc: number;          // accuracy radius in metres
  alt: number | null;   // altitude in metres (often barometric on iOS)
  altAcc: number | null;
  heading: number | null;
  speed: number | null;
}

export interface HikeAttempt {
  id: string;
  date: string; // ISO string
  startTime: number;
  endTime?: number;
  totalTime?: number; // ms
  splits: Split[];
  elevationData: { time: number; elevation: number }[];
  completed: boolean;
  // GPS fixes captured when the user tapped Start / Finish. Stored but never surfaced in the UI.
  startCoords?: GpsCoord;
  endCoords?: GpsCoord;
  // User override: when true, auto-tracking is disabled regardless of GPS/marker availability.
  manualOverride?: boolean;
  tags?: HikeTag[];
  // Trail this attempt was logged on. Older attempts without this field are treated as BCMC.
  trailId?: TrailId;
  // Raw GPS fix stream throttled to ~1 Hz. Optional — older hikes won't have it.
  gpsTrack?: GpsFix[];
}

// Averaged GPS coordinates per marker across all attempts
export interface MarkerGpsData {
  [marker: number]: { latitudes: number[]; longitudes: number[]; altitudes: number[] };
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const STORAGE_KEY = "bcmc-hike-attempts";
const MARKER_GPS_KEY = "bcmc-marker-gps";
const ACTIVE_HIKE_KEY = "bcmc-active-hike";
const ACTIVE_TRAIL_KEY = "active-trail-id";
const HISTORY_FILTER_KEY = "history-trail-filter";

export function loadActiveTrailId(): TrailId {
  try {
    const raw = localStorage.getItem(ACTIVE_TRAIL_KEY);
    return isTrailId(raw) ? raw : DEFAULT_TRAIL_ID;
  } catch {
    return DEFAULT_TRAIL_ID;
  }
}

export function saveActiveTrailId(id: TrailId) {
  try {
    localStorage.setItem(ACTIVE_TRAIL_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadHistoryFilter(): TrailId[] {
  try {
    const raw = localStorage.getItem(HISTORY_FILTER_KEY);
    if (!raw) return ["bcmc", "grind"];
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter(isTrailId);
    return ["bcmc", "grind"];
  } catch {
    return ["bcmc", "grind"];
  }
}

export function saveHistoryFilter(ids: TrailId[]) {
  try {
    localStorage.setItem(HISTORY_FILTER_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/** Read trail id from a possibly-legacy attempt; defaults to BCMC. */
export function attemptTrailId(a: HikeAttempt): TrailId {
  return a.trailId ?? "bcmc";
}

/** Convenience: get the Trail object for an attempt. */
export function attemptTrail(a: HikeAttempt) {
  return getTrail(attemptTrailId(a));
}

export function saveActiveHike(attempt: HikeAttempt | null) {
  if (attempt) {
    localStorage.setItem(ACTIVE_HIKE_KEY, JSON.stringify(attempt));
  } else {
    localStorage.removeItem(ACTIVE_HIKE_KEY);
  }
}

export function loadActiveHike(): HikeAttempt | null {
  try {
    const raw = localStorage.getItem(ACTIVE_HIKE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearActiveHike() {
  localStorage.removeItem(ACTIVE_HIKE_KEY);
}

export function loadAttempts(): HikeAttempt[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAttempts(attempts: HikeAttempt[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
}

export function loadMarkerGps(): MarkerGpsData {
  try {
    const raw = localStorage.getItem(MARKER_GPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveMarkerGps(data: MarkerGpsData) {
  localStorage.setItem(MARKER_GPS_KEY, JSON.stringify(data));
}

/** Record a GPS coordinate sample for a marker (for future auto-detection) */
export function recordMarkerGps(marker: number, coord: GpsCoord) {
  if (coord.latitude === 0 && coord.longitude === 0) return;
  const data = loadMarkerGps();
  if (!data[marker]) {
    data[marker] = { latitudes: [], longitudes: [], altitudes: [] };
  }
  data[marker].latitudes.push(coord.latitude);
  data[marker].longitudes.push(coord.longitude);
  if (coord.altitude != null) {
    data[marker].altitudes.push(coord.altitude);
  }
  saveMarkerGps(data);
}

export function getAverageMarkerPositions(): Map<number, { lat: number; lng: number; alt: number | null; samples: number }> {
  const data = loadMarkerGps();
  const map = new Map<number, { lat: number; lng: number; alt: number | null; samples: number }>();
  for (const [key, val] of Object.entries(data)) {
    const marker = Number(key);
    const n = val.latitudes.length;
    if (n === 0) continue;
    const lat = val.latitudes.reduce((a, b) => a + b, 0) / n;
    const lng = val.longitudes.reduce((a, b) => a + b, 0) / n;
    const alt = val.altitudes.length > 0
      ? val.altitudes.reduce((a, b) => a + b, 0) / val.altitudes.length
      : null;
    map.set(marker, { lat, lng, alt, samples: n });
  }
  return map;
}

export function createAttempt(trailId: TrailId = DEFAULT_TRAIL_ID): HikeAttempt {
  return {
    id: generateId(),
    date: new Date().toISOString(),
    startTime: Date.now(),
    splits: [],
    elevationData: [],
    completed: false,
    trailId,
  };
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatSplitDiff(current: number, best?: number): { text: string; positive: boolean } | null {
  if (best === undefined) return null;
  const diff = current - best;
  const sign = diff >= 0 ? "+" : "-";
  return { text: `${sign}${formatDuration(Math.abs(diff))}`, positive: diff <= 0 };
}

/**
 * Local timestamp in a format Excel parses natively as a date-time:
 * `YYYY-MM-DD HH:MM:SS` (no `T`, no `Z`), in the device's local timezone.
 * Plain ISO with a `Z` suffix imports as text in many Excel locales, so we
 * build the string from local calendar fields instead.
 */
function formatExcelLocal(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Canonical cumulative along-trail distance (m) for a marker number. Known
 * markers use their dataset distance; markers missing from the dataset use the
 * split's saved progress override, else linear interpolation between the
 * nearest known neighbours. Start = 0, finish = full trail length.
 */
function cumulativeDistanceForMarker(
  trail: ReturnType<typeof attemptTrail>,
  marker: number,
  override?: Split["progressOverride"],
): number {
  if (marker <= 0) return 0;
  if (marker >= trail.finishMarker) return trail.totalDistanceM;
  const rec = trail.markersByNum.get(marker);
  if (rec) return rec.distanceM;
  if (override) return override.distanceM;
  return interpolateMarkerProgress(trail, marker).distanceM;
}

export function exportHikesAsCsv(attempts: HikeAttempt[]): void {
  const headers = [
    "Hike ID",
    "Trail",
    "Hike Start (local)",
    "Trail Marker Number",
    "Trail Number Forgotten",
    "Trail Marker Timestamp (local)",
    "Latitude",
    "Longitude",
    "Altitude (m)",
    "GPS Accuracy (m)",
    "Cumulative Trail Distance (m)",
    "Segment Distance (m)",
    "Logging Mode",
  ];

  // Lat / Lng / Alt as separate numeric columns (no packed "lat,lng,alt" cell)
  // so Excel imports each as a real number.
  const coordCols = (c?: GpsCoord): { lat: string; lng: string; alt: string; acc: string } => {
    if (!c) return { lat: "", lng: "", alt: "", acc: "" };
    return {
      lat: c.latitude.toFixed(7),
      lng: c.longitude.toFixed(7),
      alt: c.altitude != null ? c.altitude.toFixed(1) : "",
      acc: c.accuracy != null ? c.accuracy.toFixed(1) : "",
    };
  };

  const rows: string[][] = [];
  // Req 4: oldest hike first.
  const ordered = [...attempts].sort((a, b) => a.startTime - b.startTime);
  for (const attempt of ordered) {
    if (!attempt.completed) continue;
    const trail = attemptTrail(attempt);
    const startLocal = formatExcelLocal(attempt.startTime);

    // Segment distance accumulates from the last *captured* marker. Missing /
    // forgotten markers leave their own segment blank so the next captured
    // marker spans the whole gap — giving an honest distance for speed.
    let lastCapturedCum = 0; // start line is the origin reference

    // Start row (marker 0)
    const startGps = coordCols(attempt.startCoords);
    rows.push([
      attempt.id,
      trail.name,
      startLocal,
      "0",
      "FALSE",
      startLocal,
      startGps.lat,
      startGps.lng,
      startGps.alt,
      startGps.acc,
      "0.0",
      "",
      "",
    ]);

    // Combined, time-ordered stream of splits + tags so tags appear in
    // chronological order next to the marker rows they sit between.
    type Event =
      | { kind: "split"; at: number; split: Split }
      | { kind: "tag"; at: number; tag: HikeTag };
    const events: Event[] = [];
    for (const s of attempt.splits) events.push({ kind: "split", at: s.timestamp, split: s });
    for (const t of attempt.tags ?? []) events.push({ kind: "tag", at: t.timestamp, tag: t });
    events.sort((a, b) => a.at - b.at);

    for (const ev of events) {
      if (ev.kind === "tag") {
        const tagGps = coordCols(ev.tag.coords);
        rows.push([
          attempt.id,
          trail.name,
          startLocal,
          `Tag: ${ev.tag.text}`,
          "FALSE",
          formatExcelLocal(ev.tag.timestamp),
          tagGps.lat,
          tagGps.lng,
          tagGps.alt,
          tagGps.acc,
          "", // tags aren't trail markers — no distance
          "",
          "",
        ]);
        continue;
      }
      const split = ev.split;
      const gps = coordCols(split.coords);
      const cum = cumulativeDistanceForMarker(trail, split.marker, split.progressOverride);
      // Captured markers report a segment from the last captured marker and
      // become the new reference; forgotten markers leave it blank.
      const segment = split.skipped ? "" : (cum - lastCapturedCum).toFixed(1);
      if (!split.skipped) lastCapturedCum = cum;
      rows.push([
        attempt.id,
        trail.name,
        startLocal,
        String(split.marker),
        split.skipped ? "TRUE" : "FALSE",
        formatExcelLocal(split.timestamp),
        gps.lat,
        gps.lng,
        gps.alt,
        gps.acc,
        cum.toFixed(1),
        segment,
        split.mode ?? "",
      ]);
    }

    // Finish row (per-trail finish marker number)
    if (attempt.endTime) {
      const endGps = coordCols(attempt.endCoords);
      const cum = trail.totalDistanceM;
      rows.push([
        attempt.id,
        trail.name,
        startLocal,
        String(trail.finishMarker),
        "FALSE",
        formatExcelLocal(attempt.endTime),
        endGps.lat,
        endGps.lng,
        endGps.alt,
        endGps.acc,
        cum.toFixed(1),
        (cum - lastCapturedCum).toFixed(1),
        "manual",
      ]);
    }
  }

  // Quote only cells that need it, so numbers and dates import typed (not as text).
  const escape = (cell: string) =>
    /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
  const csvContent = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hikes-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export the raw GPS track from completed hikes — one row per fix. Supports
 * offline analysis + future algorithm iteration (snap-to-segment, altitude
 * fusion, Kalman filtering). Hikes recorded before gpsTrack was introduced
 * are skipped.
 */
export function exportGpsTracksAsCsv(attempts: HikeAttempt[]): void {
  const headers = [
    "Hike ID",
    "Trail",
    "Hike Start Date-Time",
    "Fix Elapsed (ms)",
    "Fix Timestamp",
    "Latitude",
    "Longitude",
    "Accuracy (m)",
    "Altitude (m)",
    "Altitude Accuracy (m)",
    "Heading (deg)",
    "Speed (m/s)",
  ];
  const rows: string[][] = [];
  for (const attempt of attempts) {
    if (!attempt.completed) continue;
    if (!attempt.gpsTrack || attempt.gpsTrack.length === 0) continue;
    const trail = attemptTrail(attempt);
    const startDateTime = new Date(attempt.startTime).toISOString();
    for (const fix of attempt.gpsTrack) {
      rows.push([
        attempt.id,
        trail.name,
        startDateTime,
        String(fix.t),
        new Date(attempt.startTime + fix.t).toISOString(),
        fix.lat.toFixed(7),
        fix.lng.toFixed(7),
        fix.acc.toFixed(1),
        fix.alt != null ? fix.alt.toFixed(2) : "",
        fix.altAcc != null ? fix.altAcc.toFixed(2) : "",
        fix.heading != null ? fix.heading.toFixed(1) : "",
        fix.speed != null ? fix.speed.toFixed(2) : "",
      ]);
    }
  }
  if (rows.length === 0) return;

  const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `hikes-gps-track-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
