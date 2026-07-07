import { useMemo } from "react";
import type { HikeAttempt } from "@/lib/hike-store";
import { formatDuration } from "@/lib/hike-store";
import type { Trail } from "@/lib/trails";
import {
  cumulativeTimes,
  personalBest,
  recentAverage,
  fadeAnalysis,
  type PaceReference,
} from "@/lib/pace-plan";
import { TrendingDown, TrendingUp, Scale } from "lucide-react";

interface HikeReportProps {
  attempt: HikeAttempt;
  trail: Trail;
  /** Full history — references are computed from the *other* attempts. */
  attempts: HikeAttempt[];
}

const CHART_W = 300;
const CHART_H = 90;
const PAD_X = 6;
const PAD_Y = 12;

function signed(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
  return `${sign}${formatDuration(Math.abs(ms))}`;
}

/**
 * Post-hike race report: cumulative time delta vs PB and recent average at
 * every captured marker, plus half-split fade. Rendered inside the expanded
 * history card.
 */
export default function HikeReport({ attempt, trail, attempts }: HikeReportProps) {
  const others = useMemo(() => attempts.filter((a) => a.id !== attempt.id), [attempts, attempt.id]);
  const pb = useMemo(() => personalBest(others, trail), [others, trail]);
  const recent = useMemo(() => recentAverage(others, trail), [others, trail]);
  const curve = useMemo(() => cumulativeTimes(attempt, trail), [attempt, trail]);
  const fade = useMemo(() => fadeAnalysis(attempt, trail), [attempt, trail]);

  const deltaSeries = (ref: PaceReference | null) => {
    if (!ref) return [];
    return curve
      .filter((p) => ref.cumMsByMarker.has(p.marker))
      .map((p) => ({ x: p.distancePct, deltaMs: p.cumMs - ref.cumMsByMarker.get(p.marker)! }));
  };

  const vsPb = useMemo(() => deltaSeries(pb), [curve, pb]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsRecent = useMemo(() => deltaSeries(recent), [curve, recent]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNewPb = pb !== null && attempt.totalTime !== undefined && attempt.totalTime < pb.totalMs;

  if (!pb && !fade) return null;

  // Chart scale across both series. Positive delta = behind (slower) → drawn below the zero line.
  const allDeltas = [...vsPb, ...vsRecent].map((p) => p.deltaMs);
  const maxAbs = Math.max(30_000, ...allDeltas.map((d) => Math.abs(d)));
  const toX = (pct: number) => PAD_X + (pct / 100) * (CHART_W - 2 * PAD_X);
  const toY = (deltaMs: number) => CHART_H / 2 + (deltaMs / maxAbs) * (CHART_H / 2 - PAD_Y);
  const path = (pts: { x: number; deltaMs: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.x).toFixed(1)},${toY(p.deltaMs).toFixed(1)}`).join(" ");

  const finalVsPb = vsPb.length > 0 ? vsPb[vsPb.length - 1].deltaMs : null;
  const finalVsRecent = vsRecent.length > 0 ? vsRecent[vsRecent.length - 1].deltaMs : null;

  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Race report</p>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {isNewPb && (
          <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-accent/15 border border-accent/35 text-accent">
            New PB {finalVsPb !== null ? `(${signed(finalVsPb)})` : ""}
          </span>
        )}
        {!isNewPb && finalVsPb !== null && (
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${finalVsPb <= 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
            {finalVsPb <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            vs PB {signed(finalVsPb)}
          </span>
        )}
        {finalVsRecent !== null && (
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 ${finalVsRecent <= 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-muted border-border text-muted-foreground"}`}>
            {finalVsRecent <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            vs recent avg {signed(finalVsRecent)}
          </span>
        )}
        {fade && (
          <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-muted border border-border text-muted-foreground flex items-center gap-1">
            <Scale className="w-3 h-3" />
            Halves {formatDuration(fade.firstHalfMs)} / {formatDuration(fade.secondHalfMs)}
          </span>
        )}
      </div>

      {/* Cumulative delta chart */}
      {(vsPb.length > 1 || vsRecent.length > 1) && (
        <div>
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="block w-full" style={{ height: 84 }}>
            {/* zero line */}
            <line x1={PAD_X} y1={CHART_H / 2} x2={CHART_W - PAD_X} y2={CHART_H / 2} strokeWidth="1" strokeDasharray="3 3" className="stroke-muted-foreground/40" />
            <text x={PAD_X} y={CHART_H / 2 - 4} className="fill-muted-foreground/60" fontSize="7">ahead ↑</text>
            <text x={PAD_X} y={CHART_H / 2 + 10} className="fill-muted-foreground/60" fontSize="7">behind ↓</text>
            {vsRecent.length > 1 && (
              <path d={path(vsRecent)} fill="none" strokeWidth="1.5" className="stroke-muted-foreground/50" />
            )}
            {vsPb.length > 1 && (
              <path d={path(vsPb)} fill="none" strokeWidth="2" className="stroke-accent" />
            )}
          </svg>
          <div className="flex gap-3 justify-center text-[10px] text-muted-foreground">
            {vsPb.length > 1 && (
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-accent inline-block rounded" /> vs PB</span>
            )}
            {vsRecent.length > 1 && (
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-muted-foreground/50 inline-block rounded" /> vs recent avg</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
