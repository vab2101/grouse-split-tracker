import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import mlcontour from "maplibre-contour";
import "maplibre-gl/dist/maplibre-gl.css";
import { TRAIL_ROUTE } from "@/lib/trail-gpx";

// Trail bounds computed once at module load
const LATS = TRAIL_ROUTE.map((p) => p.lat);
const LNGS = TRAIL_ROUTE.map((p) => p.lng);
const TRAIL_BOUNDS: [[number, number], [number, number]] = [
  [Math.min(...LNGS), Math.min(...LATS)],
  [Math.max(...LNGS), Math.max(...LATS)],
];

// The marker button is 176 px wide/tall (Tailwind w-44/h-44) and vertically
// centered in the map region, with a ~40 px "Forgot marker" chip underneath.
// These constants describe the footprint we need to keep clear of the trail.
const BUTTON_HALF = 88; // 176 / 2
const BUTTON_BOTTOM_EXTRA = 52; // ~forgot-chip height + gap
const EDGE_BUFFER = 20; // small breathing room from the map edges

/**
 * Compute fitBounds padding that:
 *  - pushes the trail's right-most and bottom-most extents close to the right
 *    and bottom edges of the map area (issue #22 spec)
 *  - keeps the trail clear of the centered marker button + chip
 *
 * Scales with the actual map container size so it works across phone, tablet,
 * and desktop viewports, with clamps so the padding never exceeds the
 * available space (maplibre rejects fitBounds when padding > viewport).
 */
function computeFitPadding(w: number, h: number) {
  // Minimum usable bbox size — if the button+edge buffers would crush the
  // trail into a sliver, we back off instead so the route stays legible.
  const MIN_BBOX = 120;

  // Ideal: push the trail to the right of the button and below it + its chip.
  let left = w / 2 + BUTTON_HALF + EDGE_BUFFER;
  let top = h / 2 + BUTTON_HALF + BUTTON_BOTTOM_EXTRA + EDGE_BUFFER;
  const right = EDGE_BUFFER;
  const bottom = EDGE_BUFFER;

  // Back off the heavier side if the remaining bbox would be too small.
  if (w - left - right < MIN_BBOX) left = Math.max(w - right - MIN_BBOX, 0);
  if (h - top - bottom < MIN_BBOX) top = Math.max(h - bottom - MIN_BBOX, 0);

  return { top, right, bottom, left };
}

// Track whether the DEM source has been wired into maplibre globally — we
// only want to call `setupMaplibre` once per page load.
let demSourceInitialized = false;

interface MapBackgroundProps {
  /** 0-1 fraction of trail completed; positions the pulsing current-location dot. */
  progress: number;
}

/** Build the LineString coordinates for the completed portion of the trail
 *  from the start up to a given 0-1 progress fraction along the polyline. */
function completedCoords(progress: number): [number, number][] {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return [];
  const idxF = clamped * (TRAIL_ROUTE.length - 1);
  const idx = Math.floor(idxF);
  const frac = idxF - idx;
  const coords: [number, number][] = TRAIL_ROUTE.slice(0, idx + 1).map((p) => [
    p.lng,
    p.lat,
  ]);
  if (idx < TRAIL_ROUTE.length - 1 && frac > 0) {
    const a = TRAIL_ROUTE[idx];
    const b = TRAIL_ROUTE[idx + 1];
    coords.push([a.lng + frac * (b.lng - a.lng), a.lat + frac * (b.lat - a.lat)]);
  }
  return coords;
}

export default function MapBackground({ progress }: MapBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pulseMarkerRef = useRef<maplibregl.Marker | null>(null);
  const mapLoadedRef = useRef(false);

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current) return;

    if (!demSourceInitialized) {
      const demSource = new mlcontour.DemSource({
        url: "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png",
        encoding: "terrarium",
        maxzoom: 13,
        worker: true,
      });
      demSource.setupMaplibre(maplibregl);
      // Stash URL for the style below
      (window as unknown as { __bcmcContourUrl?: string }).__bcmcContourUrl =
        demSource.contourProtocolUrl({
          multiplier: 1,
          overzoom: 1,
          thresholds: {
            11: [50, 250],
            12: [25, 100],
            13: [20, 100],
            14: [10, 50],
            15: [10, 50],
          },
          elevationKey: "ele",
          levelKey: "level",
          contourLayer: "contours",
        });
      demSourceInitialized = true;
    }

    const contourTileUrl =
      (window as unknown as { __bcmcContourUrl?: string }).__bcmcContourUrl ?? "";

    const style: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        contours: {
          type: "vector",
          tiles: [contourTileUrl],
          maxzoom: 15,
        },
      },
      layers: [
        {
          id: "bg",
          type: "background",
          paint: { "background-color": "#141816" },
        },
        {
          id: "contour-minor",
          type: "line",
          source: "contours",
          "source-layer": "contours",
          filter: ["!=", ["get", "level"], 1],
          paint: {
            "line-color": "hsla(145, 35%, 55%, 0.22)",
            "line-width": 0.7,
          },
        },
        {
          id: "contour-major",
          type: "line",
          source: "contours",
          "source-layer": "contours",
          filter: ["==", ["get", "level"], 1],
          paint: {
            "line-color": "hsla(145, 50%, 65%, 0.5)",
            "line-width": 1.4,
          },
        },
      ],
    };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style,
      interactive: false,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("trail", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: TRAIL_ROUTE.map((p) => [p.lng, p.lat]),
          },
        },
      });
      map.addLayer({
        id: "trail-glow",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "hsl(145, 70%, 55%)",
          "line-width": 12,
          "line-opacity": 0.22,
          "line-blur": 6,
        },
      });
      map.addLayer({
        id: "trail-core",
        type: "line",
        source: "trail",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "hsl(145, 85%, 70%)",
          "line-width": 3.2,
          "line-opacity": 0.6,
        },
      });

      // Completed portion — separate source + layers so we can highlight it
      // in a warmer color as the hiker progresses through each marker.
      map.addSource("trail-done", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: completedCoords(progress),
          },
        },
      });
      map.addLayer({
        id: "trail-done-glow",
        type: "line",
        source: "trail-done",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "hsl(35, 95%, 60%)",
          "line-width": 14,
          "line-opacity": 0.3,
          "line-blur": 6,
        },
      });
      map.addLayer({
        id: "trail-done-core",
        type: "line",
        source: "trail-done",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "hsl(38, 100%, 70%)",
          "line-width": 3.8,
          "line-opacity": 1,
        },
      });

      mapLoadedRef.current = true;

      // Start-point marker
      const startEl = document.createElement("div");
      startEl.className = "trail-start-dot";
      new maplibregl.Marker({ element: startEl, anchor: "center" })
        .setLngLat([TRAIL_ROUTE[0].lng, TRAIL_ROUTE[0].lat])
        .addTo(map);

      // Pulsing current-position marker (kept in a ref so we can move it)
      const pulseEl = document.createElement("div");
      pulseEl.className = "trail-pulse-dot";
      pulseMarkerRef.current = new maplibregl.Marker({
        element: pulseEl,
        anchor: "center",
      })
        .setLngLat([TRAIL_ROUTE[0].lng, TRAIL_ROUTE[0].lat])
        .addTo(map);

      const c = map.getContainer();
      map.fitBounds(TRAIL_BOUNDS, {
        padding: computeFitPadding(c.clientWidth, c.clientHeight),
        animate: false,
        duration: 0,
      });
    });

    const onResize = () => {
      map.resize();
      const c = map.getContainer();
      map.fitBounds(TRAIL_BOUNDS, {
        padding: computeFitPadding(c.clientWidth, c.clientHeight),
        animate: false,
        duration: 0,
      });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      pulseMarkerRef.current?.remove();
      pulseMarkerRef.current = null;
      mapLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Move the pulsing marker and update the completed-trail overlay as progress changes
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, progress));
    const idxF = clamped * (TRAIL_ROUTE.length - 1);
    const idx = Math.floor(idxF);
    const frac = idxF - idx;
    const a = TRAIL_ROUTE[idx];
    const b = TRAIL_ROUTE[Math.min(idx + 1, TRAIL_ROUTE.length - 1)];
    const lat = a.lat + frac * (b.lat - a.lat);
    const lng = a.lng + frac * (b.lng - a.lng);

    pulseMarkerRef.current?.setLngLat([lng, lat]);

    if (mapRef.current && mapLoadedRef.current) {
      const src = mapRef.current.getSource("trail-done") as
        | maplibregl.GeoJSONSource
        | undefined;
      src?.setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: completedCoords(clamped),
        },
      });
    }
  }, [progress]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
