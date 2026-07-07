// Pace planning + post-hike analysis.
//
// Everything works off cumulative time-at-marker curves. Skipped splits are
// excluded — their timestamps record when the app *noticed* the miss, not when
// the hiker passed the marker, so they carry no pace information.

import type { HikeAttempt, Split } from "./hike-store";
import { attemptTrailId } from "./hike-store";
import { interpolateMarkerProgress, type Trail, type TrailId } from "./trails";

export interface MarkerTime {
  marker: number;
  cumMs: number;
  /** 0..100 along-trail distance for this marker. */
  distancePct: number;
}

/** Distance % for a split, honouring manual-mode progress overrides. */
function splitDistancePct(trail: Trail, s: Split): number {
  if (s.progressOverride) return s.progressOverride.distancePct;
  const rec = trail.markersByNum.get(s.marker);
  if (rec) return rec.distancePct;
  return interpolateMarkerProgress(trail, s.marker).distancePct;
}

/** Cumulative time curve for one completed attempt (non-skipped splits + finish). */
export function cumulativeTimes(attempt: HikeAttempt, trail: Trail): MarkerTime[] {
  const out: MarkerTime[] = [];
  for (const s of attempt.splits) {
    if (s.skipped) continue;
    out.push({ marker: s.marker, cumMs: s.elapsed, distancePct: splitDistancePct(trail, s) });
  }
  if (attempt.completed && attempt.totalTime) {
    out.push({ marker: trail.finishMarker, cumMs: attempt.totalTime, distancePct: 100 });
  }
  return out;
}

/** Interpolated cumulative time (ms) at a given distance %, or null when out of range. */
export function timeAtDistancePct(curve: MarkerTime[], pct: number): number | null {
  if (curve.length === 0) return null;
  const pts = [{ marker: 0, cumMs: 0, distancePct: 0 }, ...curve];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (pct >= a.distancePct && pct <= b.distancePct) {
      const span = b.distancePct - a.distancePct;
      const t = span > 0 ? (pct - a.distancePct) / span : 0;
      return a.cumMs + t * (b.cumMs - a.cumMs);
    }
  }
  return pct > pts[pts.length - 1].distancePct ? null : 0;
}

export interface PaceReference {
  label: string;
  totalMs: number;
  /** Cumulative target time per marker number. */
  cumMsByMarker: Map<number, number>;
}

function completedOnTrail(attempts: HikeAttempt[], trailId: TrailId): HikeAttempt[] {
  return attempts
    .filter((a) => a.completed && a.totalTime && attemptTrailId(a) === trailId)
    .sort((a, b) => a.startTime - b.startTime); // oldest → newest
}

export function personalBest(attempts: HikeAttempt[], trail: Trail): PaceReference | null {
  const done = completedOnTrail(attempts, trail.id);
  if (done.length === 0) return null;
  const best = done.reduce((a, b) => (a.totalTime! <= b.totalTime! ? a : b));
  const curve = cumulativeTimes(best, trail);
  return {
    label: "PB",
    totalMs: best.totalTime!,
    cumMsByMarker: new Map(curve.map((p) => [p.marker, p.cumMs])),
  };
}

const EWMA_ALPHA = 0.4;
const RECENT_N = 5;

/**
 * Exponentially-weighted moving average of the last few hikes, newest
 * weighted heaviest. Per-marker EWMA over the attempts that captured that
 * marker, so one forgotten tap doesn't hole the whole reference.
 */
export function recentAverage(attempts: HikeAttempt[], trail: Trail): PaceReference | null {
  const done = completedOnTrail(attempts, trail.id).slice(-RECENT_N);
  if (done.length === 0) return null;

  const ewma = new Map<number, number>(); // marker → running average
  let totalEwma: number | null = null;
  for (const a of done) {
    for (const p of cumulativeTimes(a, trail)) {
      const prev = ewma.get(p.marker);
      ewma.set(p.marker, prev === undefined ? p.cumMs : prev + EWMA_ALPHA * (p.cumMs - prev));
    }
    totalEwma = totalEwma === null ? a.totalTime! : totalEwma + EWMA_ALPHA * (a.totalTime! - totalEwma);
  }
  return { label: "Recent avg", totalMs: totalEwma!, cumMsByMarker: ewma };
}

export interface FadeAnalysis {
  firstHalfMs: number;
  secondHalfMs: number;
  /** secondHalf / firstHalf. Terrain makes ~this trail's PB ratio the baseline, not 1.0. */
  ratio: number;
}

export function fadeAnalysis(attempt: HikeAttempt, trail: Trail): FadeAnalysis | null {
  const curve = cumulativeTimes(attempt, trail);
  if (!attempt.totalTime || curve.length < 3) return null;
  const half = timeAtDistancePct(curve, 50);
  if (half === null || half <= 0) return null;
  const second = attempt.totalTime - half;
  return { firstHalfMs: half, secondHalfMs: second, ratio: second / half };
}

export interface PlanCheckpoint {
  label: string;
  distancePct: number;
  /** Nearest real marker at/after this distance, when one exists. */
  marker: number | null;
  targetMs: number;
}

export interface PacePlan {
  targetTotalMs: number;
  /** Basis for the target: beating PB or beating the recent average. */
  basis: "pb" | "recent";
  checkpoints: PlanCheckpoint[];
  /** Cumulative target per marker — used for live "vs plan" deltas. */
  cumMsByMarker: Map<number, number>;
  advice: string[];
  hikeCount: number;
}

const CHECKPOINTS = [
  { label: "¼", pct: 25 },
  { label: "½", pct: 50 },
  { label: "¾", pct: 75 },
  { label: "Finish", pct: 100 },
];

/**
 * Build the next-hike plan. Target = beat PB by pacing to the *shape* of the
 * recent average, fade flattened: the historical curve is corrected so the
 * second half doesn't decay, then scaled to the target total. This converts
 * "you always die at the top" into concrete slower-early / stronger-late
 * checkpoint times.
 */
export function buildPlan(attempts: HikeAttempt[], trail: Trail): PacePlan | null {
  const done = completedOnTrail(attempts, trail.id);
  if (done.length === 0) return null;

  const pb = personalBest(attempts, trail)!;
  const recent = recentAverage(attempts, trail)!;
  const shapeRef = recent; // recent shape reflects current fitness better than a months-old PB

  // Target: nudge under the better of PB / recent average.
  const basis: PacePlan["basis"] = pb.totalMs <= recent.totalMs ? "pb" : "recent";
  const targetTotalMs = Math.min(pb.totalMs, recent.totalMs) * 0.99;

  // Median fade across recent attempts — drives the flattening + advice.
  const fades = done
    .slice(-RECENT_N)
    .map((a) => fadeAnalysis(a, trail))
    .filter((f): f is FadeAnalysis => f !== null)
    .map((f) => f.ratio)
    .sort((a, b) => a - b);
  const medianFade = fades.length > 0 ? fades[Math.floor(fades.length / 2)] : null;

  // Shape: cumulative fraction of total time at each marker, from the recent
  // average, with the second half compressed by the fade so the plan front-
  // loads caution instead of replaying the blow-up.
  const flatten = medianFade !== null && medianFade > 1.02 ? Math.sqrt(medianFade) : 1;
  const markers = [...trail.markers].sort((a, b) => a.distanceM - b.distanceM);
  const cumMsByMarker = new Map<number, number>();
  const shapeCurve: MarkerTime[] = [...shapeRef.cumMsByMarker.entries()]
    .map(([marker, cumMs]) => {
      const rec = trail.markersByNum.get(marker);
      return rec ? { marker, cumMs, distancePct: rec.distancePct } : { marker, cumMs, distancePct: marker === trail.finishMarker ? 100 : -1 };
    })
    .filter((p) => p.distancePct >= 0)
    .sort((a, b) => a.distancePct - b.distancePct);

  const shapeAt = (pct: number): number | null => {
    const t = timeAtDistancePct(shapeCurve, pct);
    return t === null ? null : t / shapeRef.totalMs;
  };

  // Fade correction: stretch first-half fractions up, pull second-half down,
  // renormalised so 100% still maps to 1.0.
  const corrected = (pct: number): number | null => {
    const f = shapeAt(pct);
    if (f === null) return null;
    if (flatten === 1) return f;
    // Weight: first half slower (fractions grow), second half faster.
    const w = pct <= 50 ? flatten : 1 / flatten;
    const half = shapeAt(50) ?? 0.5;
    if (pct <= 50) {
      return Math.min(1, f * ((half * w) / half));
    }
    const tail = 1 - half;
    const correctedHalf = Math.min(1, half * flatten);
    return correctedHalf + ((f - half) / tail) * (1 - correctedHalf);
  };

  for (const m of markers) {
    const frac = corrected(m.distancePct);
    if (frac !== null) cumMsByMarker.set(m.marker, frac * targetTotalMs);
  }
  cumMsByMarker.set(trail.finishMarker, targetTotalMs);

  const checkpoints: PlanCheckpoint[] = CHECKPOINTS.map(({ label, pct }) => {
    const nearest = markers.find((m) => m.distancePct >= pct) ?? null;
    const frac = corrected(pct) ?? pct / 100;
    return {
      label,
      distancePct: pct,
      marker: pct === 100 ? trail.finishMarker : nearest?.marker ?? null,
      targetMs: pct === 100 ? targetTotalMs : frac * targetTotalMs,
    };
  });

  // Advice.
  const advice: string[] = [];
  if (medianFade !== null && medianFade > 1.08) {
    const pctSlower = Math.round((medianFade - 1) * 100);
    advice.push(
      `You typically run the second half ${pctSlower}% slower than the first. Start easier: the plan holds back ~${Math.round(((flatten - 1) * (shapeAt(50) ?? 0.5) * targetTotalMs) / 1000 / 60 * 10) / 10} min in the first half to spend up top.`,
    );
  } else if (medianFade !== null && medianFade < 0.98) {
    advice.push("You finish faster than you start — you likely have time banked in a harder first half.");
  } else if (medianFade !== null) {
    advice.push("Your halves are well balanced. Gains now come from overall fitness, not pacing.");
  }

  // Biggest opportunity: segment (between consecutive commonly-captured
  // markers) with the largest gap between recent average and personal
  // gold-split (best-ever segment time).
  const opportunity = biggestOpportunity(done.slice(-RECENT_N), trail);
  if (opportunity) {
    advice.push(
      `Biggest opportunity: markers ${opportunity.fromMarker}–${opportunity.toMarker}. Your best is ${fmtMin(opportunity.bestMs)}, recent average ${fmtMin(opportunity.avgMs)} — ${fmtMin(opportunity.avgMs - opportunity.bestMs)} on the table.`,
    );
  }
  if (done.length < 3) {
    advice.push("Plan confidence is low with under 3 recorded hikes — log a few more for a sharper plan.");
  }

  return { targetTotalMs, basis, checkpoints, cumMsByMarker, advice, hikeCount: done.length };
}

interface Opportunity {
  fromMarker: number;
  toMarker: number;
  bestMs: number;
  avgMs: number;
}

function biggestOpportunity(attempts: HikeAttempt[], trail: Trail): Opportunity | null {
  // Segment times keyed "from→to" over consecutive captured markers.
  const segs = new Map<string, { from: number; to: number; times: number[] }>();
  for (const a of attempts) {
    const curve = cumulativeTimes(a, trail);
    const withStart = [{ marker: 0, cumMs: 0, distancePct: 0 }, ...curve];
    for (let i = 1; i < withStart.length; i++) {
      const from = withStart[i - 1];
      const to = withStart[i];
      const k = `${from.marker}→${to.marker}`;
      const e = segs.get(k) ?? { from: from.marker, to: to.marker, times: [] };
      e.times.push(to.cumMs - from.cumMs);
      segs.set(k, e);
    }
  }
  let best: Opportunity | null = null;
  for (const { from, to, times } of segs.values()) {
    if (times.length < 2) continue; // need repeats to call it a pattern
    const bestMs = Math.min(...times);
    const avgMs = times.reduce((a, b) => a + b, 0) / times.length;
    const gap = avgMs - bestMs;
    if (gap > 15_000 && (!best || gap > best.avgMs - best.bestMs)) {
      best = { fromMarker: from, toMarker: to, bestMs, avgMs };
    }
  }
  return best;
}

function fmtMin(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
