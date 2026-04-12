/**
 * Simulated hike tests
 *
 * Exercises the full hike lifecycle — start, log markers (including a skipped
 * one), finish — and verifies the per-segment stats logic that drives the
 * history expanded-split view (This / Best / Avg columns).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createAttempt,
  saveActiveHike,
  loadActiveHike,
  clearActiveHike,
  saveAttempts,
  loadAttempts,
  formatDuration,
  formatSplitDiff,
  recordMarkerGps,
  getAverageMarkerPositions,
  MAX_MARKERS,
  Split,
  HikeAttempt,
} from "@/lib/hike-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a completed HikeAttempt from a list of elapsed-ms marker times. */
function buildHike(
  elapsedMs: number[],
  skippedMarkers: number[] = [],
  startTime = 0
): HikeAttempt {
  const attempt = { ...createAttempt(), startTime };
  attempt.splits = elapsedMs.map((elapsed, i) => ({
    marker: i + 1,
    timestamp: startTime + elapsed,
    elapsed,
    skipped: skippedMarkers.includes(i + 1),
  }));
  const totalTime = elapsedMs[elapsedMs.length - 1];
  return {
    ...attempt,
    endTime: startTime + totalTime,
    totalTime,
    completed: true,
  };
}

/** Reproduce the markerStats computation from HikeHistory. */
function buildMarkerStats(hikes: HikeAttempt[]) {
  const stats = new Map<number, { best: number; totalMs: number; count: number }>();
  for (const a of hikes) {
    for (let i = 0; i < a.splits.length; i++) {
      const s = a.splits[i];
      if (s.skipped) continue;
      const prev = a.splits[i - 1];
      const seg = prev ? s.elapsed - prev.elapsed : s.elapsed;
      const ex = stats.get(s.marker);
      if (!ex) {
        stats.set(s.marker, { best: seg, totalMs: seg, count: 1 });
      } else {
        stats.set(s.marker, {
          best: Math.min(ex.best, seg),
          totalMs: ex.totalMs + seg,
          count: ex.count + 1,
        });
      }
    }
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("zero", () => expect(formatDuration(0)).toBe("00:00"));
  it("sub-minute", () => expect(formatDuration(45_000)).toBe("00:45"));
  it("exact minute", () => expect(formatDuration(60_000)).toBe("01:00"));
  it("minutes and seconds", () => expect(formatDuration(91_000)).toBe("01:31"));
  it("one hour", () => expect(formatDuration(3_600_000)).toBe("1:00:00"));
  it("hours minutes seconds", () => expect(formatDuration(3_723_000)).toBe("1:02:03"));
});

describe("formatSplitDiff", () => {
  it("returns null when no best exists", () => {
    expect(formatSplitDiff(60_000, undefined)).toBeNull();
  });
  it("positive (ahead of best)", () => {
    const result = formatSplitDiff(55_000, 60_000)!;
    expect(result.positive).toBe(true);
    expect(result.text).toBe("-00:05");
  });
  it("negative (behind best)", () => {
    const result = formatSplitDiff(70_000, 60_000)!;
    expect(result.positive).toBe(false);
    expect(result.text).toBe("+00:10");
  });
  it("exact match", () => {
    const result = formatSplitDiff(60_000, 60_000)!;
    expect(result.positive).toBe(true);
    expect(result.text).toBe("+00:00");
  });
});

describe("active hike persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is saved", () => {
    expect(loadActiveHike()).toBeNull();
  });

  it("roundtrips an attempt through localStorage", () => {
    const attempt = createAttempt();
    saveActiveHike(attempt);
    expect(loadActiveHike()).toEqual(attempt);
  });

  it("clearActiveHike removes the saved attempt", () => {
    saveActiveHike(createAttempt());
    clearActiveHike();
    expect(loadActiveHike()).toBeNull();
  });

  it("saving null removes the entry", () => {
    saveActiveHike(createAttempt());
    saveActiveHike(null);
    expect(loadActiveHike()).toBeNull();
  });
});

describe("simulated hike — single run", () => {
  beforeEach(() => localStorage.clear());

  it("logs 7 markers and finishes correctly", () => {
    // Marker elapsed times in ms (realistic BCMC pacing)
    const markerElapsed = [
      2 * 60_000,   // marker 1 — 2:00
      4 * 60_000,   // marker 2 — 4:00
      6 * 60_000,   // marker 3 — 6:00  (skipped, logged via Forgot)
      9 * 60_000,   // marker 4 — 9:00
      12 * 60_000,  // marker 5 — 12:00
      16 * 60_000,  // marker 6 — 16:00
      20 * 60_000,  // marker 7 — 20:00
    ];

    const hike = buildHike(markerElapsed, [3]);

    // Verify structure
    expect(hike.splits).toHaveLength(7);
    expect(hike.splits[2].skipped).toBe(true);
    expect(hike.splits[2].marker).toBe(3);
    expect(hike.totalTime).toBe(20 * 60_000);

    // Persist and reload
    saveAttempts([hike]);
    const [loaded] = loadAttempts();
    expect(loaded.completed).toBe(true);
    expect(loaded.splits).toHaveLength(7);
    expect(loaded.splits.filter((s) => s.skipped)).toHaveLength(1);
  });

  it("MAX_MARKERS constant is reasonable", () => {
    expect(MAX_MARKERS).toBeGreaterThanOrEqual(7);
    expect(MAX_MARKERS).toBeLessThanOrEqual(100);
  });
});

describe("simulated hike — segment stats across multiple runs", () => {
  beforeEach(() => localStorage.clear());

  /**
   * Two hikes with known segment times:
   *
   * Marker | Hike A seg | Hike B seg | Best | Avg
   *      1 |     60 000 |     50 000 | 50 s | 55 s
   *      2 |     70 000 |     80 000 | 70 s | 75 s
   *      3 |     90 000 |     60 000 | 60 s | 75 s
   */
  const hikeA = buildHike([60_000, 130_000, 220_000]);
  const hikeB = buildHike([50_000, 130_000, 190_000]);

  it("computes correct best per segment", () => {
    const stats = buildMarkerStats([hikeA, hikeB]);
    expect(stats.get(1)!.best).toBe(50_000);
    expect(stats.get(2)!.best).toBe(70_000);
    expect(stats.get(3)!.best).toBe(60_000);
  });

  it("computes correct average per segment", () => {
    const stats = buildMarkerStats([hikeA, hikeB]);
    expect(stats.get(1)!.totalMs / stats.get(1)!.count).toBe(55_000);
    expect(stats.get(2)!.totalMs / stats.get(2)!.count).toBe(75_000);
    expect(stats.get(3)!.totalMs / stats.get(3)!.count).toBe(75_000);
  });

  it("skipped markers are excluded from stats", () => {
    const hikeWithSkip = buildHike([60_000, 130_000, 220_000], [2]);
    const stats = buildMarkerStats([hikeWithSkip]);
    expect(stats.has(2)).toBe(false); // skipped — should not appear
    expect(stats.has(1)).toBe(true);
    expect(stats.has(3)).toBe(true);
  });

  it("a single hike has count=1 and best=avg for each segment", () => {
    const stats = buildMarkerStats([hikeA]);
    for (const [, s] of stats) {
      expect(s.count).toBe(1);
      expect(s.best).toBe(s.totalMs);
    }
  });
});

describe("GPS marker recording", () => {
  beforeEach(() => localStorage.clear());

  it("records and averages GPS samples across hikes", () => {
    recordMarkerGps(1, { latitude: 49.37, longitude: -123.08, altitude: 350, accuracy: 5 });
    recordMarkerGps(1, { latitude: 49.38, longitude: -123.09, altitude: 360, accuracy: 8 });

    const positions = getAverageMarkerPositions();
    const m1 = positions.get(1)!;
    expect(m1.samples).toBe(2);
    expect(m1.lat).toBeCloseTo(49.375);
    expect(m1.lng).toBeCloseTo(-123.085);
    expect(m1.alt).toBeCloseTo(355);
  });

  it("ignores zero-zero coordinates", () => {
    recordMarkerGps(2, { latitude: 0, longitude: 0, altitude: null, accuracy: 0 });
    const positions = getAverageMarkerPositions();
    expect(positions.has(2)).toBe(false);
  });
});
