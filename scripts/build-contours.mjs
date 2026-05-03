// Pre-bake a trail's contour map into a static SVG.
//
// Usage:
//   node scripts/build-contours.mjs bcmc
//   node scripts/build-contours.mjs grind
//
// Each trail uses its own bounding box (matching trails.ts at runtime), so the
// trail polyline and contour image align in the same SVG coordinate space.

import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const { generateIsolines, HeightTile } = require(
  require.resolve("maplibre-contour").replace(/dist\/.*$/, "dist/index.cjs")
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// 1. CLI arg → which trail to bake
// ---------------------------------------------------------------------------

const TRAIL_ID = process.argv[2];
if (TRAIL_ID !== "bcmc" && TRAIL_ID !== "grind") {
  console.error("usage: node scripts/build-contours.mjs <bcmc|grind>");
  process.exit(1);
}

const TRAIL_DATA_FILES = {
  bcmc: { src: "src/lib/trail-data-bcmc.ts", routeName: "BCMC_ROUTE", out: "public/bcmc-contours.svg" },
  grind: { src: "src/lib/trail-data-grind.ts", routeName: "GRIND_ROUTE", out: "public/grind-contours.svg" },
};
const cfg = TRAIL_DATA_FILES[TRAIL_ID];

const src = await readFile(path.join(ROOT, cfg.src), "utf8");

// Slice the source to just the route literal (avoids picking up RAW_MARKERS rows
// which also have lat/lng but use `elevation` instead of `ele`).
const startMatch = src.indexOf(`export const ${cfg.routeName}`);
if (startMatch < 0) throw new Error(`couldn't find ${cfg.routeName} in ${cfg.src}`);
const endMatch = src.indexOf("];", startMatch);
const routeBlock = src.slice(startMatch, endMatch);

const ROUTE = [];
const re = /lat:\s*(-?[\d.]+)\s*,\s*lng:\s*(-?[\d.]+)\s*,\s*ele:\s*(-?[\d.]+)/g;
let m;
while ((m = re.exec(routeBlock)) !== null) {
  ROUTE.push({ lat: +m[1], lng: +m[2], ele: +m[3] });
}
if (ROUTE.length < 50) throw new Error(`Parsed only ${ROUTE.length} points from ${cfg.src}`);
console.log(`[${TRAIL_ID}] parsed ${ROUTE.length} route points`);

// ---------------------------------------------------------------------------
// 2. Trail-specific bounds — must match trails.ts buildTrail() / trail-types.ts constants
// ---------------------------------------------------------------------------

const LAT_PAD = 0.0008;
const LNG_PAD = 0.0012;
const CONTOUR_EXTRA_LAT = 0.009;
const CONTOUR_EXTRA_LNG = 0.009;

const lats = ROUTE.map((p) => p.lat);
const lngs = ROUTE.map((p) => p.lng);

const TRAIL_GEO = {
  minLat: Math.min(...lats) - LAT_PAD,
  maxLat: Math.max(...lats) + LAT_PAD,
  minLng: Math.min(...lngs) - LNG_PAD,
  maxLng: Math.max(...lngs) + LNG_PAD,
};

const GEO = {
  minLat: TRAIL_GEO.minLat - CONTOUR_EXTRA_LAT,
  maxLat: TRAIL_GEO.maxLat + CONTOUR_EXTRA_LAT,
  minLng: TRAIL_GEO.minLng - CONTOUR_EXTRA_LNG,
  maxLng: TRAIL_GEO.maxLng + CONTOUR_EXTRA_LNG,
};

const MID_LAT = (TRAIL_GEO.minLat + TRAIL_GEO.maxLat) / 2;
const COS_MID_LAT = Math.cos((MID_LAT * Math.PI) / 180);
const SCALE = 100000;

const SVG_W = (TRAIL_GEO.maxLng - TRAIL_GEO.minLng) * COS_MID_LAT * SCALE;
const SVG_H = (TRAIL_GEO.maxLat - TRAIL_GEO.minLat) * SCALE;

const CONTOUR_PAD_X = CONTOUR_EXTRA_LNG * COS_MID_LAT * SCALE;
const CONTOUR_PAD_Y = CONTOUR_EXTRA_LAT * SCALE;
const CONTOUR_VIEW_X = -CONTOUR_PAD_X;
const CONTOUR_VIEW_Y = -CONTOUR_PAD_Y;
const CONTOUR_VIEW_W = SVG_W + 2 * CONTOUR_PAD_X;
const CONTOUR_VIEW_H = SVG_H + 2 * CONTOUR_PAD_Y;

const project = (lng, lat) => [
  (lng - TRAIL_GEO.minLng) * COS_MID_LAT * SCALE,
  (TRAIL_GEO.maxLat - lat) * SCALE,
];

console.log(
  `[${TRAIL_ID}] trail bbox: lng [${TRAIL_GEO.minLng.toFixed(5)}, ${TRAIL_GEO.maxLng.toFixed(5)}] ` +
    `lat [${TRAIL_GEO.minLat.toFixed(5)}, ${TRAIL_GEO.maxLat.toFixed(5)}]`
);
console.log(
  `[${TRAIL_ID}] contour bbox: lng [${GEO.minLng.toFixed(5)}, ${GEO.maxLng.toFixed(5)}] ` +
    `lat [${GEO.minLat.toFixed(5)}, ${GEO.maxLat.toFixed(5)}]`
);
console.log(`[${TRAIL_ID}] trail SVG viewBox: ${SVG_W.toFixed(1)} x ${SVG_H.toFixed(1)}`);
console.log(
  `[${TRAIL_ID}] contour SVG viewBox: ${CONTOUR_VIEW_X.toFixed(1)} ${CONTOUR_VIEW_Y.toFixed(1)} ` +
    `${CONTOUR_VIEW_W.toFixed(1)} x ${CONTOUR_VIEW_H.toFixed(1)}`
);

// ---------------------------------------------------------------------------
// 3. Fetch + decode Terrarium z=14 tiles covering the contour bbox
// ---------------------------------------------------------------------------

const Z = 14;
const TILE_PX = 256;

function lngToTileX(lng, z) { return ((lng + 180) / 360) * 2 ** z; }
function latToTileY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}
function tileXToLng(x, z) { return (x / 2 ** z) * 360 - 180; }
function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

const tx0 = Math.floor(lngToTileX(GEO.minLng, Z));
const tx1 = Math.floor(lngToTileX(GEO.maxLng, Z));
const ty0 = Math.floor(latToTileY(GEO.maxLat, Z));
const ty1 = Math.floor(latToTileY(GEO.minLat, Z));
const NX = tx1 - tx0 + 1;
const NY = ty1 - ty0 + 1;
console.log(`[${TRAIL_ID}] z=${Z} tiles: x [${tx0}..${tx1}] y [${ty0}..${ty1}] → ${NX}x${NY} (${NX * NY} tiles)`);

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

console.log(`[${TRAIL_ID}] fetching ${NX * NY} tiles...`);
const tiles = [];
for (let j = 0; j < NY; j++) {
  const row = [];
  for (let i = 0; i < NX; i++) {
    row.push(await fetchTile(Z, tx0 + i, ty0 + j));
  }
  tiles.push(row);
}

// ---------------------------------------------------------------------------
// 4. Stitch tiles → elevation grid
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
    const pix = png.data;
    for (let py = 0; py < TILE_PX; py++) {
      for (let px = 0; px < TILE_PX; px++) {
        const p = (py * TILE_PX + px) * 4;
        const r = pix[p], g = pix[p + 1], b = pix[p + 2];
        const h = r * 256 + g + b / 256 - 32768;
        ele[(j * TILE_PX + py) * W + (i * TILE_PX + px)] = h;
      }
    }
  }
}

let minE = Infinity, maxE = -Infinity;
for (let k = 0; k < ele.length; k++) {
  if (ele[k] < minE) minE = ele[k];
  if (ele[k] > maxE) maxE = ele[k];
}
console.log(`[${TRAIL_ID}] elevation range: ${minE.toFixed(1)} … ${maxE.toFixed(1)} m`);

// ---------------------------------------------------------------------------
// 5. Generate isolines
// ---------------------------------------------------------------------------

const heightTile = new HeightTile(W, H, (x, y) => {
  const xi = Math.max(0, Math.min(W - 1, x));
  const yi = Math.max(0, Math.min(H - 1, y));
  return ele[yi * W + xi];
});

const INTERVAL = 10;
const MAJOR_EVERY = 50;

const isolines = generateIsolines(INTERVAL, heightTile, W - 1, 0);

let totalSegs = 0;
const minorPaths = [];
const majorPaths = [];

const tileLngWidth = (tileXToLng(tx0 + NX, Z) - tileXToLng(tx0, Z)) / NX;
function pixelToLngLat(px, py) {
  const lng = tileXToLng(tx0, Z) + (px / W) * tileLngWidth * NX;
  const lat = tileYToLat(ty0 + py / TILE_PX, Z);
  return [lng, lat];
}

const MARGIN = 30;
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
      parts.push(`${i === 0 ? "M" : "L"}${simplified[i].toFixed(1)} ${simplified[i + 1].toFixed(1)}`);
    }
    bucket.push(parts.join(""));
    totalSegs++;
  }
}

console.log(`[${TRAIL_ID}] generated ${totalSegs} contour segments (${majorPaths.length} major, ${minorPaths.length} minor)`);

// ---------------------------------------------------------------------------
// 6. Emit SVG
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
const outPath = path.join(ROOT, cfg.out);
await writeFile(outPath, svg, "utf8");
console.log(`[${TRAIL_ID}] wrote ${outPath} (${(svg.length / 1024).toFixed(1)} kB)`);
