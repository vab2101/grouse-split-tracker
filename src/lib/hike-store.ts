// BCMC Trail has markers roughly numbered 1-28
// Elevation: ~290m (base) to ~1,128m (top), ~853m gain over ~2.5km

export const BCMC_MARKERS = Array.from({ length: 28 }, (_, i) => ({
  number: i + 1,
  estimatedElevation: Math.round(290 + ((i) / 27) * 853),
}));

export interface Split {
  marker: number;
  timestamp: number; // ms since epoch
  elapsed: number; // ms since hike start
  elevation?: number;
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

const STORAGE_KEY = "bcmc-hike-attempts";

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
