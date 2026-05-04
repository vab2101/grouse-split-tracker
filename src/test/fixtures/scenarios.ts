// Scenario fixtures for ActiveHike integration tests. Each scenario is a
// time-stamped sequence of GPS fixes plus the expected outcome. Drive with
// installScenario() + vi.advanceTimersByTime().

import type { ScenarioFix } from "@/lib/scenario-player";
import { BCMC_RAW_MARKERS } from "@/lib/trail-data-bcmc";
import type { TrailId } from "@/lib/trails";

export interface Scenario {
  name: string;
  trail: TrailId;
  fixes: ScenarioFix[];
  expected?: {
    markersHit?: number[];
    skipped?: number[];
    totalTimeMs?: number;
  };
}

const ACCURATE = 5;
const INACCURATE = 60;

/** Build fixes that walk through markers `[from..to]` in order, dwelling on each
 *  long enough for the auto-tracker (approach in zone → exit) to commit a split.
 *  Cadence: 1 fix/sec; 8s between markers (4s approaching, 1s on, 3s leaving). */
function fixesThroughMarkers(markers: number[], startMs = 0, accuracy = ACCURATE): ScenarioFix[] {
  const out: ScenarioFix[] = [];
  let t = startMs;
  for (let i = 0; i < markers.length; i++) {
    const m = BCMC_RAW_MARKERS.find((r) => r.marker === markers[i])!;
    const next = i + 1 < markers.length
      ? BCMC_RAW_MARKERS.find((r) => r.marker === markers[i + 1])!
      : null;
    // 4 fixes approaching the marker (offset slightly before)
    for (let k = 4; k >= 1; k--) {
      out.push({
        tMs: t,
        lat: m.lat - 0.00002 * k,
        lng: m.lng + 0.00002 * k,
        ele: m.elevation - k,
        accuracy,
      });
      t += 1000;
    }
    // ON the marker
    out.push({ tMs: t, lat: m.lat, lng: m.lng, ele: m.elevation, accuracy });
    t += 1000;
    // 3 fixes leaving toward the next marker — needed so distance is *increasing*
    // and the auto-tracker commits the split.
    for (let k = 1; k <= 3; k++) {
      const dlat = next ? (next.lat - m.lat) * (k / 4) : 0.00005 * k;
      const dlng = next ? (next.lng - m.lng) * (k / 4) : 0.00005 * k;
      out.push({
        tMs: t,
        lat: m.lat + dlat,
        lng: m.lng + dlng,
        ele: m.elevation + k,
        accuracy,
      });
      t += 1000;
    }
  }
  return out;
}

export const happyPathBcmc: Scenario = {
  name: "happy-path-bcmc",
  trail: "bcmc",
  fixes: fixesThroughMarkers([1, 2, 3, 4, 5, 6, 7]),
  expected: {
    markersHit: [1, 2, 3, 4, 5, 6, 7],
  },
};

// Additional scenarios (glitchy GPS, missed-marker, restart-mid-hike) follow the
// same pattern. Shipping the happy path first to validate the harness.
