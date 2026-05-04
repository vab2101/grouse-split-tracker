// Dev-only GPS simulator. Monkey-patches navigator.geolocation.{watchPosition, clearWatch}
// to replay points along a Trail's route at a configurable pace, so the rest of the
// app (useGps, ActiveHike) sees synthetic fixes without needing a real device.
//
// Activated from SimPanel. Has no effect when uninstalled — original geolocation methods
// are restored.

import type { Trail } from "./trails";
import { haversineM } from "./trails";

interface SimFix {
  lat: number;
  lng: number;
  ele: number;
  accuracy: number;
}

interface SimOptions {
  trail: Trail;
  /** Trail-time meters covered per real-time second. 1 = realistic slow hike, 5 = brisk replay. */
  metersPerSecond: number;
  /** Tick interval in ms. Lower = smoother; ~500ms matches real-device cadence. */
  tickMs: number;
  /** Synthetic accuracy in metres for normal fixes. */
  baseAccuracyM: number;
  /** Probability per fix of injecting a poor-accuracy spike (forces Manual mode). */
  poorFixProbability: number;
  /** Accuracy in metres used for the spike fixes. */
  poorFixAccuracyM: number;
  onProgress?: (info: { distM: number; totalM: number; idx: number; lat: number; lng: number; accuracy: number }) => void;
}

interface SimState {
  options: SimOptions;
  cumDistM: number[];
  totalDistM: number;
  watchers: Map<number, { ok: PositionCallback; err?: PositionErrorCallback | null }>;
  nextWatchId: number;
  elapsedTrailSec: number;
  paused: boolean;
  timer: ReturnType<typeof setInterval> | null;
  origWatch: typeof navigator.geolocation.watchPosition;
  origClear: typeof navigator.geolocation.clearWatch;
}

let state: SimState | null = null;

function buildCumDistances(trail: Trail): { cum: number[]; total: number } {
  const cum: number[] = [0];
  for (let i = 1; i < trail.route.length; i++) {
    const p = trail.route[i - 1];
    const q = trail.route[i];
    cum.push(cum[i - 1] + haversineM(p.lat, p.lng, q.lat, q.lng));
  }
  return { cum, total: cum[cum.length - 1] };
}

function fixAtDistance(trail: Trail, cumDistM: number[], totalDistM: number, distM: number): SimFix {
  const target = Math.max(0, Math.min(totalDistM, distM));
  let idx = 0;
  for (let i = 0; i < cumDistM.length - 1; i++) {
    if (cumDistM[i] <= target) idx = i;
  }
  const a = trail.route[idx];
  const b = trail.route[Math.min(idx + 1, trail.route.length - 1)];
  const segLen = (cumDistM[idx + 1] ?? cumDistM[idx]) - cumDistM[idx];
  const frac = segLen > 0 ? (target - cumDistM[idx]) / segLen : 0;
  return {
    lat: a.lat + frac * (b.lat - a.lat),
    lng: a.lng + frac * (b.lng - a.lng),
    ele: a.ele + frac * (b.ele - a.ele),
    accuracy: 0, // assigned by caller
  };
}

function makeGeolocationPosition(fix: SimFix, speed: number | null, heading: number | null): GeolocationPosition {
  const ts = Date.now();
  const coords: GeolocationCoordinates = {
    latitude: fix.lat,
    longitude: fix.lng,
    altitude: fix.ele,
    accuracy: fix.accuracy,
    altitudeAccuracy: 1,
    heading,
    speed,
    toJSON() {
      return { ...this };
    },
  } as GeolocationCoordinates;
  return {
    coords,
    timestamp: ts,
    toJSON() {
      return { coords, timestamp: ts };
    },
  } as GeolocationPosition;
}

function tick() {
  if (!state || state.paused) return;
  state.elapsedTrailSec += state.options.tickMs / 1000;
  const distM = Math.min(state.totalDistM, state.options.metersPerSecond * state.elapsedTrailSec);
  const fix = fixAtDistance(state.options.trail, state.cumDistM, state.totalDistM, distM);
  const opts = state.options;
  const isPoor = Math.random() < opts.poorFixProbability;
  fix.accuracy = isPoor ? opts.poorFixAccuracyM : opts.baseAccuracyM;

  // Synthetic heading from delta to next route vertex.
  let idx = 0;
  for (let i = 0; i < state.cumDistM.length - 1; i++) {
    if (state.cumDistM[i] <= distM) idx = i;
  }
  const route = state.options.trail.route;
  const nextV = route[Math.min(idx + 1, route.length - 1)];
  const dLat = nextV.lat - fix.lat;
  const dLng = nextV.lng - fix.lng;
  const heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  const headingNorm = ((heading % 360) + 360) % 360;
  const speed = opts.metersPerSecond;

  const pos = makeGeolocationPosition(fix, speed, headingNorm);
  for (const { ok } of state.watchers.values()) {
    try { ok(pos); } catch { /* ignore */ }
  }
  opts.onProgress?.({ distM, totalM: state.totalDistM, idx, lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy });
}

export function installGpsSimulator(options: SimOptions) {
  if (state) uninstallGpsSimulator();
  const { cum, total } = buildCumDistances(options.trail);
  const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const origClear = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  state = {
    options,
    cumDistM: cum,
    totalDistM: total,
    watchers: new Map(),
    nextWatchId: 1,
    elapsedTrailSec: 0,
    paused: false,
    timer: null,
    origWatch,
    origClear,
  };

  const fakeWatch = (
    success: PositionCallback,
    error?: PositionErrorCallback | null,
  ): number => {
    if (!state) return -1;
    const id = state.nextWatchId++;
    state.watchers.set(id, { ok: success, err: error });
    // Emit an immediate first fix.
    setTimeout(() => tick(), 0);
    return id;
  };

  const fakeClear = (id: number) => {
    if (!state) return;
    state.watchers.delete(id);
  };

  // Monkey-patch.
  Object.defineProperty(navigator.geolocation, "watchPosition", {
    configurable: true,
    value: fakeWatch,
  });
  Object.defineProperty(navigator.geolocation, "clearWatch", {
    configurable: true,
    value: fakeClear,
  });

  state.timer = setInterval(tick, options.tickMs);
}

export function uninstallGpsSimulator() {
  if (!state) return;
  if (state.timer) clearInterval(state.timer);
  Object.defineProperty(navigator.geolocation, "watchPosition", {
    configurable: true,
    value: state.origWatch,
  });
  Object.defineProperty(navigator.geolocation, "clearWatch", {
    configurable: true,
    value: state.origClear,
  });
  state = null;
}

export function isSimulatorActive(): boolean {
  return state !== null;
}

export function setSimulatorOptions(patch: Partial<SimOptions>) {
  if (!state) return;
  state.options = { ...state.options, ...patch };
}

export function setSimulatorPaused(p: boolean) {
  if (!state) return;
  state.paused = p;
}

export function resetSimulator() {
  if (!state) return;
  state.elapsedTrailSec = 0;
}

export function getSimulatorStatus() {
  if (!state) return null;
  return {
    elapsedTrailSec: state.elapsedTrailSec,
    distM: Math.min(state.totalDistM, state.options.metersPerSecond * state.elapsedTrailSec),
    totalM: state.totalDistM,
    paused: state.paused,
    watchers: state.watchers.size,
  };
}
