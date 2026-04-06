// BCMC Trail — markers up to ~50 (unconfirmed exact count)
// Official stats from grousemountain.com/BCMC: 2.9 km, 750m elevation gain

export const MAX_MARKERS = 50;
export const TRAIL_DISTANCE_KM = 2.9;
export const TRAIL_ELEVATION_GAIN = 750;
export const TRAIL_BASE_ELEVATION = 290;

export interface GpsCoord {
  latitude: number;
  longitude: number;
  altitude: number | null;
}

export interface Split {
  marker: number;
  timestamp: number; // ms since epoch
  elapsed: number; // ms since hike start
  elevation?: number;
  coords?: GpsCoord; // GPS location when marker was tapped
  skipped?: boolean; // true if marker was missed and retroactively inserted
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
}

// Averaged GPS coordinates per marker across all attempts
export interface MarkerGpsData {
  [marker: number]: { latitudes: number[]; longitudes: number[]; altitudes: number[] };
}

const STORAGE_KEY = "bcmc-hike-attempts";
const MARKER_GPS_KEY = "bcmc-marker-gps";
const ACTIVE_HIKE_KEY = "bcmc-active-hike";

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

export function createAttempt(): HikeAttempt {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    startTime: Date.now(),
    splits: [],
    elevationData: [],
    completed: false,
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
