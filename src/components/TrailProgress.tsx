import { useMemo } from "react";
import { TRAIL_ROUTE } from "@/lib/trail-gpx";

interface TrailProgressProps {
  /** 0–100, from the last tapped marker's CSV distance percentage */
  distancePct: number;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pre-compute route geometry once (module-level, not in render)
const cumDists: number[] = [0];
for (let i = 1; i < TRAIL_ROUTE.length; i++) {
  const p = TRAIL_ROUTE[i - 1];
  const q = TRAIL_ROUTE[i];
  cumDists.push(cumDists[i - 1] + haversineM(p.lat, p.lng, q.lat, q.lng));
}
const TOTAL_DIST = cumDists[cumDists.length - 1];

const lats = TRAIL_ROUTE.map((p) => p.lat);
const lngs = TRAIL_ROUTE.map((p) => p.lng);
const eles = TRAIL_ROUTE.map((p) => p.ele);
const MIN_LAT = Math.min(...lats);
const MAX_LAT = Math.max(...lats);
const MIN_LNG = Math.min(...lngs);
const MAX_LNG = Math.max(...lngs);
const MIN_ELE = Math.min(...eles);
const MAX_ELE = Math.max(...eles);

// Lat/lng aspect-ratio correction so the map isn't distorted
const LAT_RANGE = MAX_LAT - MIN_LAT;
const LNG_RANGE = MAX_LNG - MIN_LNG;
const COS_LAT = Math.cos(((MIN_LAT + MAX_LAT) / 2) * (Math.PI / 180));
// We'll fit into a 300-wide viewBox; height scales by actual geographic ratio
const MAP_W = 300;
const MAP_H = Math.round((LAT_RANGE / (LNG_RANGE * COS_LAT)) * MAP_W);

const ELEV_W = 300;
const ELEV_H = 70;
const PAD = 4;

function toElevX(distFrac: number) {
  return PAD + distFrac * (ELEV_W - 2 * PAD);
}
function toElevY(ele: number) {
  return ELEV_H - PAD - ((ele - MIN_ELE) / (MAX_ELE - MIN_ELE)) * (ELEV_H - 2 * PAD);
}
function toMapX(lng: number) {
  return PAD + ((lng - MIN_LNG) / LNG_RANGE) * (MAP_W - 2 * PAD);
}
function toMapY(lat: number) {
  return MAP_H - PAD - ((lat - MIN_LAT) / LAT_RANGE) * (MAP_H - 2 * PAD);
}

// Build full SVG paths once
const FULL_ELEV_PATH = TRAIL_ROUTE.map((pt, i) => {
  const x = toElevX(cumDists[i] / TOTAL_DIST);
  const y = toElevY(pt.ele);
  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

const FULL_MAP_PATH = TRAIL_ROUTE.map((pt, i) => {
  const x = toMapX(pt.lng);
  const y = toMapY(pt.lat);
  return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");

// Area close strings for full trail (used to make filled shapes)
const ELEV_FULL_AREA =
  FULL_ELEV_PATH +
  ` L${toElevX(1).toFixed(1)},${(ELEV_H - PAD).toFixed(1)} L${PAD},${ELEV_H - PAD} Z`;

export default function TrailProgress({ distancePct }: TrailProgressProps) {
  const { progIdx, progFrac } = useMemo(() => {
    const targetDist = (distancePct / 100) * TOTAL_DIST;
    let idx = 0;
    for (let i = 0; i < cumDists.length - 1; i++) {
      if (cumDists[i] <= targetDist) idx = i;
    }
    const segLen = cumDists[idx + 1] !== undefined ? cumDists[idx + 1] - cumDists[idx] : 0;
    const frac = segLen > 0 ? (targetDist - cumDists[idx]) / segLen : 0;
    return { progIdx: idx, progFrac: frac };
  }, [distancePct]);

  // Interpolated progress dot position — elevation sparkline
  const elevDotX = useMemo(() => {
    const targetDist = (distancePct / 100) * TOTAL_DIST;
    return toElevX(targetDist / TOTAL_DIST);
  }, [distancePct]);

  const elevDotY = useMemo(() => {
    const next = TRAIL_ROUTE[progIdx + 1];
    const ele =
      next !== undefined
        ? TRAIL_ROUTE[progIdx].ele + progFrac * (next.ele - TRAIL_ROUTE[progIdx].ele)
        : TRAIL_ROUTE[progIdx].ele;
    return toElevY(ele);
  }, [progIdx, progFrac]);

  // Interpolated progress dot position — map sparkline
  const { mapDotX, mapDotY } = useMemo(() => {
    const cur = TRAIL_ROUTE[progIdx];
    const next = TRAIL_ROUTE[progIdx + 1];
    const lat = next !== undefined ? cur.lat + progFrac * (next.lat - cur.lat) : cur.lat;
    const lng = next !== undefined ? cur.lng + progFrac * (next.lng - cur.lng) : cur.lng;
    return { mapDotX: toMapX(lng), mapDotY: toMapY(lat) };
  }, [progIdx, progFrac]);

  // Completed-portion paths
  const { doneElevArea, doneElevLine } = useMemo(() => {
    const linePts = TRAIL_ROUTE.slice(0, progIdx + 1).map((pt, i) => {
      const x = toElevX(cumDists[i] / TOTAL_DIST);
      const y = toElevY(pt.ele);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    linePts.push(`L${elevDotX.toFixed(1)},${elevDotY.toFixed(1)}`);
    const line = linePts.join(" ");
    const area =
      line +
      ` L${elevDotX.toFixed(1)},${(ELEV_H - PAD).toFixed(1)} L${PAD},${ELEV_H - PAD} Z`;
    return { doneElevArea: area, doneElevLine: line };
  }, [progIdx, elevDotX, elevDotY]);

  const doneMapPath = useMemo(() => {
    const pts = TRAIL_ROUTE.slice(0, progIdx + 1).map((pt, i) => {
      const x = toMapX(pt.lng);
      const y = toMapY(pt.lat);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    });
    pts.push(`L${mapDotX.toFixed(1)},${mapDotY.toFixed(1)}`);
    return pts.join(" ");
  }, [progIdx, mapDotX, mapDotY]);

  return (
    <div className="flex gap-3 w-full px-4 py-2">
      {/* Elevation profile */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground mb-0.5 text-center tracking-wide">
          Elevation
        </p>
        <svg
          viewBox={`0 0 ${ELEV_W} ${ELEV_H}`}
          className="w-full"
          style={{ height: 56 }}
          preserveAspectRatio="none"
        >
          {/* Full trail area — faint */}
          <path d={ELEV_FULL_AREA} className="fill-muted-foreground/10" />
          {/* Full trail line */}
          <path
            d={FULL_ELEV_PATH}
            fill="none"
            strokeWidth="1"
            className="stroke-muted-foreground/30"
          />
          {/* Completed area */}
          <path d={doneElevArea} className="fill-primary/25" />
          {/* Completed line */}
          <path d={doneElevLine} fill="none" strokeWidth="1.5" className="stroke-primary/70" />
          {/* Progress dot */}
          <circle cx={elevDotX} cy={elevDotY} r="4" className="fill-primary" />
          <circle cx={elevDotX} cy={elevDotY} r="4" fill="none" strokeWidth="1.5" className="stroke-background" />
        </svg>
      </div>

      {/* 2D route map */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-muted-foreground mb-0.5 text-center tracking-wide">
          Route
        </p>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="w-full"
          style={{ height: 56 }}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Full route */}
          <path
            d={FULL_MAP_PATH}
            fill="none"
            strokeWidth="2"
            className="stroke-muted-foreground/30"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Completed portion */}
          <path
            d={doneMapPath}
            fill="none"
            strokeWidth="2.5"
            className="stroke-primary/80"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Start dot */}
          <circle
            cx={toMapX(TRAIL_ROUTE[0].lng)}
            cy={toMapY(TRAIL_ROUTE[0].lat)}
            r="3"
            className="fill-muted-foreground/50"
          />
          {/* Progress dot */}
          <circle cx={mapDotX} cy={mapDotY} r="4" className="fill-primary" />
          <circle cx={mapDotX} cy={mapDotY} r="4" fill="none" strokeWidth="1.5" className="stroke-background" />
        </svg>
      </div>
    </div>
  );
}
