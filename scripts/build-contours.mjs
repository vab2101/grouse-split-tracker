// Pre-bake the BCMC trail contour map into a static SVG.
//
// Run once (or whenever the trail bbox changes):
//   node scripts/build-contours.mjs
//
// Fetches the small handful of Terrarium DEM tiles that cover the trail
// area, runs maplibre-contour's marching-squares isoline generator, and
// writes the result to public/bcmc-contours.svg in the same coordinate
// system used at runtime by src/lib/trail-bounds.ts. After it runs, the
// app no longer needs to talk to s3.amazonaws.com at all.

import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
// maplibre-contour's package "exports" only allow the bare entry point and
// pin browser/CJS variants — we import the file path directly to bypass it.
const { generateIsolines, HeightTile } = require(
  require.resolve("maplibre-contour").replace(/dist\/.*$/, "dist/index.cjs")
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. Trail bounds — must match src/lib/trail-bounds.ts exactly
// ---------------------------------------------------------------------------

const trailGpxSrc = await readFile(
  path.join(ROOT, "src/lib/trail-gpx.ts"),
  "utf8"
);
const ROUTE = [];
const re = /lat:\s*(-?[\d.]+)\s*,\s*lng:\s*(-?[\d.]+)\s*,\s*ele:\s*(-?[\d.]+)/g;
let m;
while ((m = re.exec(trailGpxSrc)) !== null) {
  ROUTE.push({ lat: +m[1], lng: +m[2], ele: +m[3] });
}
if (ROUTE.length < 50) throw new Error(`Parsed only ${ROUTE.length} points`);

// Must match src/lib/trail-bounds.ts exactly
const LAT_PAD = 0.0008;
const LNG_PAD = 0.0012;
const CONTOUR_EXTRA_LAT = 0.009;
const CONTOUR_EXTRA_LNG = 0.009;

const lats = ROUTE.map((p) => p.lat);
const lngs = ROUTE.map((p) => p.lng);

// TRAIL_GEO — the tight bbox used as the projection origin so that the
// contour SVG coordinates line up with the runtime-projected trail path.
const TRAIL_GEO = {
  minLat: Math.min(...lats) - LAT_PAD,
  maxLat: Math.max(...lats) + LAT_PAD,
  minLng: Math.min(...lngs) - LNG_PAD,
  maxLng: Math.max(...lngs) + LNG_PAD,
};

// CONTOUR_GEO — the larger bbox we actually fetch DEM tiles for. This lets
// MapBackground translate the scene at runtime without leaving blank strips
// of viewport uncovered by contour lines.
const GEO = {
  minLat: TRAIL_GEO.minLat - CONTOUR_EXTRA_LAT,
  maxLat: TRAIL_GEO.maxLat + CONTOUR_EXTRA_LAT,
  minLng: TRAIL_GEO.minLng - CONTOUR_EXTRA_LNG,
  maxLng: TRAIL_GEO.maxLng + CONTOUR_EXTRA_LNG,
};

const MID_LAT = (TRAIL_GEO.minLat + TRAIL_GEO.maxLat) / 2;
const COS_MID_LAT = Math.cos((MID_LAT * Math.PI) / 180);
const SCALE = 100000;

// Trail SVG viewBox dims — the runtime "trail coord system" everything is in.
const SVG_W = (TRAIL_GEO.maxLng - TRAIL_GEO.minLng) * COS_MID_LAT * SCALE;
const SVG_H = (TRAIL_GEO.maxLat - TRAIL_GEO.minLat) * SCALE;

// Contour viewBox — extends into negative x/y past the trail's bbox.
const CONTOUR_PAD_X = CONTOUR_EXTRA_LNG * COS_MID_LAT * SCALE;
const CONTOUR_PAD_Y = CONTOUR_EXTRA_LAT * SCALE;
const CONTOUR_VIEW_X = -CONTOUR_PAD_X;
const CONTOUR_VIEW_Y = -CONTOUR_PAD_Y;
const CONTOUR_VIEW_W = SVG_W + 2 * CONTOUR_PAD_X;
const CONTOUR_VIEW_H = SVG_H + 2 * CONTOUR_PAD_Y;

// Project using the TRAIL origin so trail + contours share a coord system.
const project = (lng, lat) => [
  (lng - TRAIL_GEO.minLng) * COS_MID_LAT * SCALE,
  (TRAIL_GEO.maxLat - lat) * SCALE,
];

console.log(
  `trail bbox: lng [${TRAIL_GEO.minLng.toFixed(5)}, ${TRAIL_GEO.maxLng.toFixed(5)}] ` +
    `lat [${TRAIL_GEO.minLat.toFixed(5)}, ${TRAIL_GEO.maxLat.toFixed(5)}]`
);
console.log(
  `contour bbox: lng [${GEO.minLng.toFixed(5)}, ${GEO.maxLng.toFixed(5)}] ` +
    `lat [${GEO.minLat.toFixed(5)}, ${GEO.maxLat.toFixed(5)}]`
);
console.log(`trail SVG viewBox: ${SVG_W.toFixed(1)} x ${SVG_H.toFixed(1)}`);
console.log(
  `contour SVG viewBox: ${CONTOUR_VIEW_X.toFixed(1)} ${CONTOUR_VIEW_Y.toFixed(1)} ` +
    `${CONTOUR_VIEW_W.toFixed(1)} x ${CONTOUR_VIEW_H.toFixed(1)}`
);

// ---------------------------------------------------------------------------
// 2. Figure out which Terrarium z=14 tiles cover that bbox, fetch + decode
// ---------------------------------------------------------------------------

const Z = 14;
const TILE_PX = 256;

function lngToTileX(lng, z) {
  return ((lng + 180) / 360) * 2 ** z;
}
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
// Inverse: tile x/y → lng/lat (top-left of pixel)
function tileXToLng(x, z) {
  return (x / 2 ** z) * 360 - 180;
}
function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

const tx0 = Math.floor(lngToTileX(GEO.minLng, Z));
const tx1 = Math.floor(lngToTileX(GEO.maxLng, Z));
const ty0 = Math.floor(latToTileY(GEO.maxLat, Z)); // smaller y = higher lat
const ty1 = Math.floor(latToTileY(GEO.minLat, Z));
const NX = tx1 - tx0 + 1;
const NY = ty1 - ty0 + 1;
console.log(
  `z=${Z} tiles: x [${tx0}..${tx1}] y [${ty0}..${ty1}] → ${NX}x${NY} (${NX * NY} tiles)`
);

async function fetchTile(z, x, y) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${url} → ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return await new Promise((resolve, reject) => {
        new PNG().parse(buf, (err, png) => (err ? reject(err) : resolve(png)));
      });
    } catch (e) {
      lastErr = e;
      console.log(`  retry ${attempt}/5 after: ${e.message}`);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastErr;
}

// Fetch tiles sequentially to avoid rate-limit 503s.
console.log(`fetching ${NX * NY} tiles...`);
const tiles = [];
for (let j = 0; j < NY; j++) {
  const row = [];
  for (let i = 0; i < NX; i++) {
    row.push(await fetchTile(Z, tx0 + i, ty0 + j));
  }
  tiles.push(row);
}

// ---------------------------------------------------------------------------
// 3. Stitch tiles into one big elevation grid
// ---------------------------------------------------------------------------

const W = NX * TILE_PX;
const H = NY * TILE_PX;
const ele = new Float32Array(W * H);

for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX; i++) {
    const png = tiles[j][i];
    if (png.width !== TILE_PX || png.height !== TILE_PX) {
      throw new Error(`Unexpected tile size ${png.width}x${png.height}`);
    }
    const pix = png.data; // RGBA, length = 256*256*4
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const p = (py * TILE_PX + px) * 4;
        const r = pix[p], g = pix[p + 1], b = pix[p + 2];
        // Terrarium decoding: height = (R*256 + G + B/256) - 32768
        const h = r * 256 + g + b / 256 - 32768;
        const X = i * TILE_PX + px;
        const Y = j * TILE_PX + py;
        ele[Y * W + X] = h;
      }
    }
  }
}

// Compute elevation range to size threshold passes correctly
let minE = Infinity, maxE = -Infinity;
for (let k = 0; k < ele.length; k++) {
  if (ele[k] < minE) minE = ele[k];
  if (ele[k] > maxE) maxE = ele[k];
}
console.log(`elevation range: ${minE.toFixed(1)} … ${maxE.toFixed(1)} m`);

// ---------------------------------------------------------------------------
// 4. Generate isolines (single 10-m pass; classify major as multiples of 50)
// ---------------------------------------------------------------------------

const heightTile = new HeightTile(W, H, (x, y) => {
  // generateIsolines may probe outside the tile — clamp to edges.
  const xi = Math.max(0, Math.min(W - 1, x));
  const yi = Math.max(0, Math.min(H - 1, y));
  return ele[yi * W + xi];
});

const INTERVAL = 10;
const MAJOR_EVERY = 50; // 50 m thick lines

// extent = W - 1 makes generateIsolines emit pixel-space coordinates (1:1).
const isolines = generateIsolines(INTERVAL, heightTile, W - 1, 0);

let totalSegs = 0;
const minorPaths = [];
const majorPaths = [];

const tileLngWidth = (tileXToLng(tx0 + NX, Z) - tileXToLng(tx0, Z)) / NX;
const tileTopLat = tileYToLat(ty0, Z);
const tileBottomLat = tileYToLat(ty0 + NY, Z);

function pixelToLngLat(px, py) {
  // px in [0, W], py in [0, H]
  const lng = tileXToLng(tx0, Z) + (px / W) * tileLngWidth * NX;
  // Mercator y is non-linear in lat — use exact inverse per pixel.
  const lat = tileYToLat(ty0 + py / TILE_PX, Z);
  return [lng, lat];
}

// Crop margin: keep segments that fall (mostly) within the viewBox, with
// a small overrun so lines visibly leave the edge instead of stopping at it.
const MARGIN = 30;

// Ramer–Douglas–Peucker line simplification — drops near-colinear vertices.
// EPSILON in SVG units; viewBox is ~1270 wide, displayed at <600 px, so 1.5
// SVG units ≈ 0.7 display pixels — visually lossless.
const RDP_EPSILON = 1.5;

function rdp(pts, eps) {
  if (pts.length <= 4) return pts;
  function perpDist(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1);
    const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    const tx = x1 + t * dx, ty = y1 + t * dy;
    return Math.hypot(x - tx, y - ty);
  }
  function simplify(start, end) {
    let maxD = 0, idx = -1;
    const x1 = pts[start * 2], y1 = pts[start * 2 + 1];
    const x2 = pts[end * 2], y2 = pts[end * 2 + 1];
    for (let i = start + 1; i < end; i++) {
      const d = perpDist(pts[i * 2], pts[i * 2 + 1], x1, y1, x2, y2);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > eps && idx > -1) {
      return [...simplify(start, idx), ...simplify(idx, end).slice(1)];
    }
    return [start, end];
  }
  const indices = simplify(0, pts.length / 2 - 1);
  const out = [];
  for (const i of indices) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

for (const eleStr of Object.keys(isolines)) {
  const elev = +eleStr;
  const isMajor = elev % MAJOR_EVERY === 0;
  const bucket = isMajor ? majorPaths : minorPaths;
  for (const seg of isolines[elev]) {
    // seg = [x1,y1,x2,y2,...] in pixel coordinates of the stitched DEM.
    const projected = [];
    let anyInside = false;
    for (let i = 0; i < seg.length; i += 2) {
      const [lng, lat] = pixelToLngLat(seg[i], seg[i + 1]);
      const [sx, sy] = project(lng, lat);
      projected.push(sx, sy);
      if (
        sx >= CONTOUR_VIEW_X - MARGIN &&
        sx <= CONTOUR_VIEW_X + CONTOUR_VIEW_W + MARGIN &&
        sy >= CONTOUR_VIEW_Y - MARGIN &&
        sy <= CONTOUR_VIEW_Y + CONTOUR_VIEW_H + MARGIN
      ) {
        anyInside = true;
      }
    }
    if (!anyInside) continue;
    const simplified = rdp(projected, RDP_EPSILON);
    const parts = [];
    for (let i = 0; i < simplified.length; i += 2) {
      parts.push(
        `${i === 0 ? "M" : "L"}${simplified[i].toFixed(1)} ${simplified[i + 1].toFixed(1)}`
      );
    }
    bucket.push(parts.join(""));
    totalSegs++;
  }
}

console.log(
  `generated ${totalSegs} contour segments ` +
    `(${majorPaths.length} major, ${minorPaths.length} minor)`
);

// ---------------------------------------------------------------------------
// 5. Emit SVG
// ---------------------------------------------------------------------------

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CONTOUR_VIEW_X.toFixed(2)} ${CONTOUR_VIEW_Y.toFixed(2)} ${CONTOUR_VIEW_W.toFixed(2)} ${CONTOUR_VIEW_H.toFixed(2)}" preserveAspectRatio="none">
  <g class="contours-minor" fill="none" stroke="hsla(145, 35%, 55%, 0.22)" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="${minorPaths.join(" ")}"/>
  </g>
  <g class="contours-major" fill="none" stroke="hsla(145, 50%, 65%, 0.5)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="${majorPaths.join(" ")}"/>
  </g>
</svg>
`;

const outDir = path.join(ROOT, "public");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "bcmc-contours.svg");
await writeFile(outPath, svg, "utf8");
console.log(`wrote ${outPath} (${(svg.length / 1024).toFixed(1)} kB)`);
