import { describe, it, expect } from "vitest";
import {
  cumulativeTimes,
  timeAtDistancePct,
  personalBest,
  recentAverage,
  fadeAnalysis,
  buildPlan,
} from "@/lib/pace-plan";
import { GRIND_TRAIL } from "@/lib/trails";
import type { HikeAttempt, Split } from "@/lib/hike-store";

const trail = GRIND_TRAIL;

/** Build a completed attempt with cumulative times spread linearly over known markers. */
function makeAttempt(id: string, totalMs: number, opts?: { fadeRatio?: number; startTime?: number; skipMarkers?: number[] }): HikeAttempt {
  const fade = opts?.fadeRatio ?? 1;
  const startTime = opts?.startTime ?? 1_700_000_000_000;
  const splits: Split[] = [];
  for (const m of trail.markers) {
    if (m.marker === 0 || m.marker >= trail.finishMarker) continue;
    const frac = m.distancePct / 100;
    // fade: second half takes `fade`× the time-per-distance of the first half.
    const halfShare = 1 / (1 + fade);
    const cumFrac = frac <= 0.5 ? frac * 2 * halfShare : halfShare + (frac - 0.5) * 2 * (1 - halfShare);
    const elapsed = Math.round(cumFrac * totalMs);
    if (opts?.skipMarkers?.includes(m.marker)) {
      splits.push({ marker: m.marker, timestamp: startTime + elapsed, elapsed, skipped: true });
    } else {
      splits.push({ marker: m.marker, timestamp: startTime + elapsed, elapsed });
    }
  }
  return {
    id,
    date: new Date(startTime).toISOString(),
    startTime,
    endTime: startTime + totalMs,
    totalTime: totalMs,
    splits,
    elevationData: [],
    completed: true,
    trailId: "grind",
  };
}

describe("cumulativeTimes", () => {
  it("excludes skipped splits and appends the finish", () => {
    const a = makeAttempt("a", 3_600_000, { skipMarkers: [trail.markers[2].marker] });
    const curve = cumulativeTimes(a, trail);
    expect(curve.some((p) => p.marker === trail.markers[2].marker)).toBe(false);
    expect(curve[curve.length - 1]).toMatchObject({ marker: trail.finishMarker, cumMs: 3_600_000, distancePct: 100 });
  });
});

describe("timeAtDistancePct", () => {
  it("interpolates between markers", () => {
    const a = makeAttempt("a", 3_600_000);
    const curve = cumulativeTimes(a, trail);
    const t50 = timeAtDistancePct(curve, 50)!;
    expect(t50).toBeGreaterThan(0);
    expect(t50).toBeLessThan(3_600_000);
    // Even pacing (fade=1) → 50% distance ≈ 50% time.
    expect(t50 / 3_600_000).toBeCloseTo(0.5, 1);
  });
});

describe("personalBest / recentAverage", () => {
  it("PB picks fastest total, recent average weights newest heaviest", () => {
    const attempts = [
      makeAttempt("old-fast", 3_000_000, { startTime: 1_700_000_000_000 }),
      makeAttempt("mid", 3_800_000, { startTime: 1_700_100_000_000 }),
      makeAttempt("new-slow", 4_000_000, { startTime: 1_700_200_000_000 }),
    ];
    const pb = personalBest(attempts, trail)!;
    expect(pb.totalMs).toBe(3_000_000);
    const avg = recentAverage(attempts, trail)!;
    // EWMA of 3.0M, 3.8M, 4.0M (α=0.4, newest last) sits between mid and newest.
    expect(avg.totalMs).toBeGreaterThan(3_000_000);
    expect(avg.totalMs).toBeLessThan(4_000_000);
    expect(avg.totalMs).toBeGreaterThan(3_400_000); // pulled toward recent slow runs
  });

  it("returns null with no completed attempts on the trail", () => {
    expect(personalBest([], trail)).toBeNull();
    expect(recentAverage([], trail)).toBeNull();
  });
});

describe("fadeAnalysis", () => {
  it("detects a fade (second half slower)", () => {
    const a = makeAttempt("fade", 3_600_000, { fadeRatio: 1.3 });
    const f = fadeAnalysis(a, trail)!;
    expect(f.ratio).toBeGreaterThan(1.15);
    expect(f.firstHalfMs + f.secondHalfMs).toBeCloseTo(3_600_000, -3);
  });

  it("even pacing → ratio ≈ 1", () => {
    const a = makeAttempt("even", 3_600_000, { fadeRatio: 1 });
    const f = fadeAnalysis(a, trail)!;
    expect(f.ratio).toBeGreaterThan(0.9);
    expect(f.ratio).toBeLessThan(1.1);
  });
});

describe("buildPlan", () => {
  it("targets just under the best reference and flattens a habitual fade", () => {
    const attempts = [
      makeAttempt("h1", 3_700_000, { fadeRatio: 1.25, startTime: 1_700_000_000_000 }),
      makeAttempt("h2", 3_650_000, { fadeRatio: 1.3, startTime: 1_700_100_000_000 }),
      makeAttempt("h3", 3_600_000, { fadeRatio: 1.25, startTime: 1_700_200_000_000 }),
    ];
    const plan = buildPlan(attempts, trail)!;
    expect(plan.targetTotalMs).toBeLessThan(3_600_000);
    expect(plan.checkpoints).toHaveLength(4);
    expect(plan.checkpoints[3].targetMs).toBeCloseTo(plan.targetTotalMs, 5);

    // Fade-flattened plan: planned first half takes a LARGER share of total
    // time than the historical first half did (i.e. deliberately slower start).
    const half = plan.checkpoints.find((c) => c.label === "½")!;
    const historicalHalfShare = 1 / (1 + 1.25); // ≈ 0.444
    expect(half.targetMs / plan.targetTotalMs).toBeGreaterThan(historicalHalfShare);

    // Checkpoint targets monotonically increase.
    const times = plan.checkpoints.map((c) => c.targetMs);
    expect([...times].sort((x, y) => x - y)).toEqual(times);

    // Fade advice present.
    expect(plan.advice.some((s) => s.includes("second half"))).toBe(true);
  });

  it("per-marker targets are monotonic in distance", () => {
    const attempts = [
      makeAttempt("h1", 3_700_000, { fadeRatio: 1.25, startTime: 1_700_000_000_000 }),
      makeAttempt("h2", 3_600_000, { fadeRatio: 1.25, startTime: 1_700_100_000_000 }),
    ];
    const plan = buildPlan(attempts, trail)!;
    const ordered = [...trail.markers]
      .sort((a, b) => a.distanceM - b.distanceM)
      .map((m) => plan.cumMsByMarker.get(m.marker))
      .filter((t): t is number => t !== undefined);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]).toBeGreaterThanOrEqual(ordered[i - 1] - 1); // float tolerance
    }
  });

  it("null with no history", () => {
    expect(buildPlan([], trail)).toBeNull();
  });
});
