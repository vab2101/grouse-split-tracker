import { useEffect, useRef, useState } from "react";
import { TRAIL_ROUTE } from "@/lib/trail-gpx";
import { CONTOUR_VIEW, SVG_VIEW, project } from "@/lib/trail-bounds";

interface MapBackgroundProps {
  /** 0-1 fraction of trail completed; positions the pulsing current-location dot. */
  progress: number;
}

// Pre-project full trail to SVG units once
const FULL_TRAIL_PTS: [number, number][] = TRAIL_ROUTE.map((p) =>
  project(p.lng, p.lat)
);
const FULL_TRAIL_PATH = FULL_TRAIL_PTS.map(
  ([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
).join(" ");

/** SVG path "d" for the completed portion of the trail at a given 0-1 progress. */
function completedPath(progress: number): string {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return "";
  const idxF = clamped * (TRAIL_ROUTE.length - 1);
  const idx = Math.floor(idxF);
  const frac = idxF - idx;
  const pts = FULL_TRAIL_PTS.slice(0, idx + 1);
  if (idx < TRAIL_ROUTE.length - 1 && frac > 0) {
    const a = FULL_TRAIL_PTS[idx];
    const b = FULL_TRAIL_PTS[idx + 1];
    pts.push([a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])]);
  }
  return pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}

/** Interpolated current position (in SVG units) for the pulsing dot. */
function currentPoint(progress: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, progress));
  const idxF = clamped * (TRAIL_ROUTE.length - 1);
  const idx = Math.floor(idxF);
  const frac = idxF - idx;
  const a = FULL_TRAIL_PTS[idx];
  const b = FULL_TRAIL_PTS[Math.min(idx + 1, FULL_TRAIL_PTS.length - 1)];
  return [a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])];
}

const START_POINT: [number, number] = project(
  TRAIL_ROUTE[0].lng,
  TRAIL_ROUTE[0].lat
);

/**
 * Compute the scale and translation that places the trail large in the
 * viewport while sliding its diagonal body toward the top + right strips
 * of the screen. That keeps the centered marker button and the bottom
 * Finish button sitting over the trail's sparser bottom-left / empty
 * top-left regions.
 *
 * The contour SVG is baked with enough extra geographic padding that the
 * slid scene still covers the full viewport with contour lines.
 */
function computeTransform(w: number, h: number) {
  const SHIFT_X    = 0.106 * w;   // positive = right
  const SHIFT_Y    = -0.0137 * h;   // negative = up
  const EXTRA_SCALE = 0.8500;
  const ROTATE_DEG  = -70.00;

  const scale = Math.min(w / SVG_VIEW.width, h / SVG_VIEW.height) * EXTRA_SCALE;
  const tx    = (w - SVG_VIEW.width  * scale) / 2 + SHIFT_X;
  const ty    = (h - SVG_VIEW.height * scale) / 2 + SHIFT_Y;

  return { scale, tx, ty, rotateDeg: ROTATE_DEG };
}

export default function MapBackground({ progress }: MapBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Track the container size so we can recompute the transform on resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let rotateDeg = 0;
  if (size) {
    const t = computeTransform(size.w, size.h);
    scale = t.scale;
    tx = t.tx;
    ty = t.ty;
    rotateDeg = t.rotateDeg;
  }

  const donePath = completedPath(progress);
  const [cx, cy] = currentPoint(progress);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-[#141816]">
      {size && (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          className="block"
        >
          <g transform={`translate(${tx} ${ty}) scale(${scale}) rotate(${rotateDeg} 635.5 509.0)`}>
            {/* Pre-baked contour lines — extends past the trail bbox so the
                translated scene still covers the viewport everywhere. */}
            <image
              href="/bcmc-contours.svg"
              x={CONTOUR_VIEW.x}
              y={CONTOUR_VIEW.y}
              width={CONTOUR_VIEW.width}
              height={CONTOUR_VIEW.height}
              preserveAspectRatio="none"
            />

            {/* Full trail — soft glow + crisp core */}
            <path
              d={FULL_TRAIL_PATH}
              fill="none"
              stroke="hsl(145, 70%, 55%)"
              strokeWidth={12 / scale}
              strokeOpacity={0.22}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: `blur(${6 / scale}px)` }}
            />
            <path
              d={FULL_TRAIL_PATH}
              fill="none"
              stroke="hsl(145, 85%, 70%)"
              strokeWidth={3.2 / scale}
              strokeOpacity={0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Completed portion — warmer amber overlay */}
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

            {/* Start-point dot */}
            <circle
              cx={START_POINT[0]}
              cy={START_POINT[1]}
              r={5 / scale}
              fill="hsla(45, 20%, 95%, 0.9)"
              stroke="hsl(145, 60%, 40%)"
              strokeWidth={2 / scale}
            />

            {/* Pulsing current-position dot */}
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
