import { useEffect, useRef, useState } from "react";
import { TRAIL_ROUTE } from "@/lib/trail-gpx";
import { SVG_VIEW, project } from "@/lib/trail-bounds";

// The marker button is 176 px wide/tall (Tailwind w-44/h-44) and vertically
// centered in the map region, with a ~40 px "Forgot marker" chip underneath.
// These constants describe the footprint we need to keep clear of the trail.
const BUTTON_HALF = 88; // 176 / 2
const BUTTON_BOTTOM_EXTRA = 52; // ~forgot-chip height + gap
const EDGE_BUFFER = 20; // small breathing room from the map edges

/**
 * Compute padding (in container pixels) that:
 *  - pushes the trail's right-most and bottom-most extents close to the right
 *    and bottom edges of the map area (issue #22 spec)
 *  - keeps the trail clear of the centered marker button + chip
 *
 * Scales with the actual map container size so it works across phone, tablet,
 * and desktop viewports, with clamps so the trail bbox never collapses.
 */
function computeFitPadding(w: number, h: number) {
  const MIN_BBOX = 120;

  let left = w / 2 + BUTTON_HALF + EDGE_BUFFER;
  let top = h / 2 + BUTTON_HALF + BUTTON_BOTTOM_EXTRA + EDGE_BUFFER;
  const right = EDGE_BUFFER;
  const bottom = EDGE_BUFFER;

  if (w - left - right < MIN_BBOX) left = Math.max(w - right - MIN_BBOX, 0);
  if (h - top - bottom < MIN_BBOX) top = Math.max(h - bottom - MIN_BBOX, 0);

  return { top, right, bottom, left };
}

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

export default function MapBackground({ progress }: MapBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Track the container size so we can recompute the bbox transform on resize
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

  // Compute the affine transform that maps the trail bbox into the
  // padded sub-region of the container (right-bottom anchored, clear of
  // the centered marker button).
  let scale = 1;
  let tx = 0;
  let ty = 0;
  if (size) {
    const { top, right, bottom, left } = computeFitPadding(size.w, size.h);
    const aw = Math.max(1, size.w - left - right);
    const ah = Math.max(1, size.h - top - bottom);
    scale = Math.min(aw / SVG_VIEW.width, ah / SVG_VIEW.height);
    const drawnW = SVG_VIEW.width * scale;
    const drawnH = SVG_VIEW.height * scale;
    tx = left + (aw - drawnW) / 2;
    ty = top + (ah - drawnH) / 2;
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
          <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
            {/* Pre-baked contour lines, perfectly aligned with the trail */}
            <image
              href="/bcmc-contours.svg"
              x={0}
              y={0}
              width={SVG_VIEW.width}
              height={SVG_VIEW.height}
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
