import { useMemo } from "react";
import type { Trail } from "@/lib/trails";
import { haversineM } from "@/lib/trails";

interface TrailProgressProps {
  /** 0–100, from the last tapped marker's CSV distance percentage */
  distancePct: number;
  trail: Trail;
}

const ELEV_W = 300;
const ELEV_H = 60;
const PAD = 4;

interface Geom {
  cumDists: number[];
  totalDist: number;
  minEle: number;
  maxEle: number;
  fullPath: string;
  fullArea: string;
}

const geomCache = new WeakMap<Trail, Geom>();

function geomFor(trail: Trail): Geom {
  let g = geomCache.get(trail);
  if (g) return g;
  const route = trail.route;
  const cumDists: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cumDists.push(cumDists[i - 1] + haversineM(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng));
  }
  const totalDist = cumDists[cumDists.length - 1] || 1;
  const eles = route.map((p) => p.ele);
  const minEle = Math.min(...eles);
  const maxEle = Math.max(...eles);
  const toX = (frac: number) => PAD + frac * (ELEV_W - 2 * PAD);
  const toY = (ele: number) => ELEV_H - PAD - ((ele - minEle) / Math.max(1e-6, maxEle - minEle)) * (ELEV_H - 2 * PAD);
  const fullPath = route.map((pt, i) => {
    const x = toX(cumDists[i] / totalDist);
    const y = toY(pt.ele);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fullArea = fullPath + ` L${toX(1).toFixed(1)},${(ELEV_H - PAD).toFixed(1)} L${PAD},${ELEV_H - PAD} Z`;
  g = { cumDists, totalDist, minEle, maxEle, fullPath, fullArea };
  geomCache.set(trail, g);
  return g;
}

export default function TrailProgress({ distancePct, trail }: TrailProgressProps) {
  const geom = geomFor(trail);
  const { cumDists, totalDist, minEle, maxEle, fullPath, fullArea } = geom;
  const route = trail.route;

  const toX = (frac: number) => PAD + frac * (ELEV_W - 2 * PAD);
  const toY = (ele: number) => ELEV_H - PAD - ((ele - minEle) / Math.max(1e-6, maxEle - minEle)) * (ELEV_H - 2 * PAD);

  const { progIdx, progFrac } = useMemo(() => {
    const targetDist = (distancePct / 100) * totalDist;
    let idx = 0;
    for (let i = 0; i < cumDists.length - 1; i++) {
      if (cumDists[i] <= targetDist) idx = i;
    }
    const segLen = cumDists[idx + 1] !== undefined ? cumDists[idx + 1] - cumDists[idx] : 0;
    const frac = segLen > 0 ? (targetDist - cumDists[idx]) / segLen : 0;
    return { progIdx: idx, progFrac: frac };
  }, [distancePct, cumDists, totalDist]);

  const elevDotX = useMemo(() => {
    const targetDist = (distancePct / 100) * totalDist;
    return toX(targetDist / totalDist);
  }, [distancePct, totalDist]);

  const elevDotY = useMemo(() => {
    const next = route[progIdx + 1];
    const ele =
      next !== undefined
        ? route[progIdx].ele + progFrac * (next.ele - route[progIdx].ele)
        : route[progIdx].ele;
    return toY(ele);
  }, [progIdx, progFrac, route]);

  const { doneElevArea, doneElevLine } = useMemo(() => {
    const linePts = route.slice(0, progIdx + 1).map((pt, i) => {
      const x = toX(cumDists[i] / totalDist);
      const y = toY(pt.ele);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    linePts.push(`L${elevDotX.toFixed(1)},${elevDotY.toFixed(1)}`);
    const line = linePts.join(" ");
    const area = line + ` L${elevDotX.toFixed(1)},${(ELEV_H - PAD).toFixed(1)} L${PAD},${ELEV_H - PAD} Z`;
    return { doneElevArea: area, doneElevLine: line };
  }, [progIdx, elevDotX, elevDotY, route, cumDists, totalDist]);

  return (
    <div className="w-full flex justify-center py-1.5">
      <div className="w-3/5 max-w-[260px] min-w-[180px]">
        <p className="text-[10px] text-muted-foreground mb-0.5 text-center tracking-wide">
          Elevation
        </p>
        <svg
          viewBox={`0 0 ${ELEV_W} ${ELEV_H}`}
          className="block w-full"
          style={{ height: 56 }}
          preserveAspectRatio="none"
        >
          <path d={fullArea} className="fill-muted-foreground/10" />
          <path d={fullPath} fill="none" strokeWidth="1" className="stroke-muted-foreground/30" />
          <path d={doneElevArea} className="fill-primary/25" />
          <path d={doneElevLine} fill="none" strokeWidth="1.5" className="stroke-primary/70" />
          <circle cx={elevDotX} cy={elevDotY} r="4" className="fill-primary" />
          <circle cx={elevDotX} cy={elevDotY} r="4" fill="none" strokeWidth="1.5" className="stroke-background" />
        </svg>
      </div>
    </div>
  );
}
