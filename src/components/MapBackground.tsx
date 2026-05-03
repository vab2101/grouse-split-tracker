import { useEffect, useMemo, useRef, useState } from "react";
import type { Trail } from "@/lib/trails";

interface MapBackgroundProps {
  /** 0-1 fraction of trail completed; positions the pulsing current-location dot. */
  progress: number;
  trail: Trail;
}

interface ProjectedTrail {
  pts: [number, number][];
  fullPath: string;
  start: [number, number];
}

const projectedCache = new WeakMap<Trail, ProjectedTrail>();

function projectedFor(trail: Trail): ProjectedTrail {
  let p = projectedCache.get(trail);
  if (p) return p;
  const pts = trail.route.map((q) => trail.project(q.lng, q.lat));
  const fullPath = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
  const start = trail.project(trail.route[0].lng, trail.route[0].lat);
  p = { pts, fullPath, start };
  projectedCache.set(trail, p);
  return p;
}

function completedPath(trail: Trail, progress: number, pts: [number, number][]): string {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return "";
  const idxF = clamped * (trail.route.length - 1);
  const idx = Math.floor(idxF);
  const frac = idxF - idx;
  const sliced: [number, number][] = pts.slice(0, idx + 1);
  if (idx < trail.route.length - 1 && frac > 0) {
    const a = pts[idx];
    const b = pts[idx + 1];
    sliced.push([a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])]);
  }
  return sliced
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}

function currentPoint(trail: Trail, progress: number, pts: [number, number][]): [number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const idxF = clamped * (trail.route.length - 1);
  const idx = Math.floor(idxF);
  const frac = idxF - idx;
  const a = pts[idx];
  const b = pts[Math.min(idx + 1, pts.length - 1)];
  return [a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])];
}

function computeTransform(trail: Trail, w: number, h: number) {
  const t = trail.transform;
  const scale = Math.min(w / trail.svgView.width, h / trail.svgView.height) * t.extraScale;
  const tx = (w - trail.svgView.width * scale) / 2 + t.shiftX * w;
  const ty = (h - trail.svgView.height * scale) / 2 + t.shiftY * h;
  return { scale, tx, ty, rotateDeg: t.rotateDeg };
}

export default function MapBackground({ progress, trail }: MapBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projected = useMemo(() => projectedFor(trail), [trail]);

  // Rotation pivot = centre of this trail's SVG bbox (per-trail coord system).
  const pivotX = trail.svgView.width / 2;
  const pivotY = trail.svgView.height / 2;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let rotateDeg = 0;
  if (size) {
    const t = computeTransform(trail, size.w, size.h);
    scale = t.scale;
    tx = t.tx;
    ty = t.ty;
    rotateDeg = t.rotateDeg;
  }

  const donePath = completedPath(trail, progress, projected.pts);
  const [cx, cy] = currentPoint(trail, progress, projected.pts);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#141816]">
      {size && (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="block"
        >
          <g transform={`translate(${tx} ${ty}) scale(${scale}) rotate(${rotateDeg} ${pivotX.toFixed(2)} ${pivotY.toFixed(2)})`}>
            <image
              href={trail.contourImageUrl}
              x={trail.contourView.x}
              y={trail.contourView.y}
              width={trail.contourView.width}
              height={trail.contourView.height}
              preserveAspectRatio="none"
            />

            <path
              d={projected.fullPath}
              fill="none"
              stroke="hsl(145, 70%, 55%)"
              strokeWidth={12 / scale}
              strokeOpacity={0.22}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `blur(${6 / scale}px)` }}
            />
            <path
              d={projected.fullPath}
              fill="none"
              stroke="hsl(145, 85%, 70%)"
              strokeWidth={3.2 / scale}
              strokeOpacity={0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {donePath && (
              <>
                <path
                  d={donePath}
                  fill="none"
                  stroke="hsl(35, 95%, 60%)"
                  strokeWidth={14 / scale}
                  strokeOpacity={0.3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: `blur(${6 / scale}px)` }}
                />
                <path
                  d={donePath}
                  fill="none"
                  stroke="hsl(38, 100%, 70%)"
                  strokeWidth={3.8 / scale}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}

            <circle
              cx={projected.start[0]}
              cy={projected.start[1]}
              r={5 / scale}
              fill="hsla(45, 20%, 95%, 0.9)"
              stroke="hsl(145, 60%, 40%)"
              strokeWidth={2 / scale}
            />

            <circle
              cx={cx}
              cy={cy}
              r={13 / scale}
              fill="hsla(145, 60%, 50%, 0.22)"
            />
            <circle
              cx={cx}
              cy={cy}
              r={7 / scale}
              fill="hsl(145, 60%, 50%)"
              stroke="hsl(45, 20%, 95%)"
              strokeWidth={2 / scale}
            />
          </g>
        </svg>
      )}
    </div>
  );
}
