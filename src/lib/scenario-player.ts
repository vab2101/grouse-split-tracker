// Test-only GPS scenario player. Like gps-simulator, monkey-patches
// navigator.geolocation.{watchPosition,clearWatch}, but instead of computing
// fixes from trail geometry + metersPerSecond, it emits a fixed sequence of
// pre-recorded fixes whose tMs is measured from install time. Drive with
// vi.advanceTimersByTime() in tests.

export interface ScenarioFix {
  /** Elapsed ms from installScenario() call. */
  tMs: number;
  lat: number;
  lng: number;
  ele: number;
  /** Accuracy in metres. ActiveHike forces Manual mode when accuracy > 30m. */
  accuracy: number;
}

interface PlayerState {
  fixes: ScenarioFix[];
  nextIdx: number;
  startMs: number;
  watchers: Map<number, { ok: PositionCallback; err?: PositionErrorCallback | null }>;
  nextWatchId: number;
  timer: ReturnType<typeof setInterval> | null;
  origWatch: typeof navigator.geolocation.watchPosition;
  origClear: typeof navigator.geolocation.clearWatch;
}

let state: PlayerState | null = null;

function makeGeolocationPosition(fix: ScenarioFix): GeolocationPosition {
  const ts = Date.now();
  const coords: GeolocationCoordinates = {
    latitude: fix.lat,
    longitude: fix.lng,
    altitude: fix.ele,
    accuracy: fix.accuracy,
    altitudeAccuracy: 1,
    heading: null,
    speed: null,
    toJSON() { return { ...this }; },
  } as GeolocationCoordinates;
  return {
    coords,
    timestamp: ts,
    toJSON() { return { coords, timestamp: ts }; },
  } as GeolocationPosition;
}

function tick() {
  if (!state) return;
  const elapsed = Date.now() - state.startMs;
  while (state.nextIdx < state.fixes.length && state.fixes[state.nextIdx].tMs <= elapsed) {
    const fix = state.fixes[state.nextIdx++];
    const pos = makeGeolocationPosition(fix);
    for (const { ok } of state.watchers.values()) {
      try { ok(pos); } catch { /* ignore */ }
    }
  }
}

export function installScenario(fixes: ScenarioFix[], opts?: { tickMs?: number }): void {
  if (state) uninstallScenario();
  const tickMs = opts?.tickMs ?? 100;
  const origWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const origClear = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  state = {
    fixes: [...fixes].sort((a, b) => a.tMs - b.tMs),
    nextIdx: 0,
    startMs: Date.now(),
    watchers: new Map(),
    nextWatchId: 1,
    timer: null,
    origWatch,
    origClear,
  };

  const fakeWatch = (success: PositionCallback, error?: PositionErrorCallback | null): number => {
    if (!state) return -1;
    const id = state.nextWatchId++;
    state.watchers.set(id, { ok: success, err: error });
    return id;
  };

  const fakeClear = (id: number) => {
    if (!state) return;
    state.watchers.delete(id);
  };

  Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: fakeWatch });
  Object.defineProperty(navigator.geolocation, "clearWatch", { configurable: true, value: fakeClear });

  state.timer = setInterval(tick, tickMs);
}

export function uninstallScenario(): void {
  if (!state) return;
  if (state.timer) clearInterval(state.timer);
  Object.defineProperty(navigator.geolocation, "watchPosition", { configurable: true, value: state.origWatch });
  Object.defineProperty(navigator.geolocation, "clearWatch", { configurable: true, value: state.origClear });
  state = null;
}

export function isScenarioActive(): boolean {
  return state !== null;
}
