import { useEffect, useState, useCallback } from "react";
import { Download, X, MapPin, AlertCircle } from "lucide-react";
import {
  saveMarkerTag,
  getAllMarkerTags,
  getMarkerTag,
  MarkerTag,
  clearAllMarkerTags,
} from "@/lib/marker-collector-store";
import {
  exportMarkersAsCSV,
  exportTrailAsGPX,
  downloadFile,
} from "@/lib/marker-collector-export";
import { TRAIL_ROUTE } from "@/lib/trail-gpx";

interface GeoPosition {
  lat: number;
  lng: number;
  elevation: number;
  accuracy: number;
}

const MARKERS = Array.from({ length: 40 }, (_, i) => i + 1);
const BCMC_START = { lat: 49.3711800, lng: -123.0983900, ele: 296.9 };
const BCMC_END = { lat: 49.3789700, lng: -123.0833000, ele: 1092.9 };

export default function MarkerCollector({
  onClose,
}: {
  onClose: () => void;
}) {
  const [selectedMarker, setSelectedMarker] = useState<number>(1);
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [posError, setPosError] = useState<string>("");
  const [tags, setTags] = useState<MarkerTag[]>([]);
  const [currentTag, setCurrentTag] = useState<MarkerTag | null>(null);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{
    distance: number;
    elevation: number;
  }>({ distance: 0, elevation: 0 });

  // Load tags on mount
  useEffect(() => {
    getAllMarkerTags().then(setTags);
  }, []);

  // Load current tag for selected marker
  useEffect(() => {
    getMarkerTag(selectedMarker).then(setCurrentTag);
  }, [selectedMarker]);

  // Calculate progress
  const calculateProgress = useCallback((pos: GeoPosition) => {
    let minDist = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < TRAIL_ROUTE.length; i++) {
      const dx =
        (pos.lng - TRAIL_ROUTE[i].lng) *
        Math.cos(((pos.lat + TRAIL_ROUTE[i].lat) / 2) * (Math.PI / 180)) *
        111000;
      const dy = (pos.lat - TRAIL_ROUTE[i].lat) * 111000;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i;
      }
    }

    const totalDist = TRAIL_ROUTE.length * 20; // rough estimate
    const trailDist = (bestIdx / TRAIL_ROUTE.length) * totalDist;
    const trailEle = TRAIL_ROUTE[bestIdx].ele;

    setProgress({
      distance: trailDist,
      elevation: trailEle,
    });
  }, []);

  // Start geolocation watch
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newPos: GeoPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          elevation: pos.coords.altitude || 0,
          accuracy: pos.coords.accuracy || 5,
        };
        setPosition(newPos);
        setPosError("");
        calculateProgress(newPos);
      },
      (err) => {
        setPosError(err.message);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    setWatchId(watchId);
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [calculateProgress]);

  const handleTag = async () => {
    if (!position) {
      alert("Waiting for GPS position...");
      return;
    }

    const tag = await saveMarkerTag({
      marker: selectedMarker,
      lat: position.lat,
      lng: position.lng,
      elevation: position.elevation,
      accuracy: position.accuracy,
      timestamp: Date.now(),
    });

    setTags(await getAllMarkerTags());
    setCurrentTag(tag);
  };

  const handleExport = async () => {
    const csv = exportMarkersAsCSV(tags);
    const gpx = exportTrailAsGPX();

    const now = new Date().toISOString().split("T")[0];
    downloadFile(csv, `grind-markers-${now}.csv`);
    downloadFile(gpx, `grind-trail-${now}.gpx`);
  };

  const handleClear = async () => {
    if (
      window.confirm(
        "Clear all marker data? This cannot be undone."
      )
    ) {
      await clearAllMarkerTags();
      setTags([]);
      setCurrentTag(null);
    }
  };

  const elevationPct = ((progress.elevation - BCMC_START.ele) / (BCMC_END.ele - BCMC_START.ele)) * 100;
  const collectedCount = tags.length;

  return (
    <div className="fixed inset-0 bg-black/50 z-40 flex items-end">
      <div className="bg-card w-full rounded-t-lg border-t border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="text-lg font-semibold">Tag Trail Markers</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center touch-manipulation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* GPS Status */}
          <div className="bg-muted/50 rounded p-3 text-sm space-y-1">
            {position ? (
              <>
                <div className="flex items-center gap-2 text-green-600">
                  <MapPin className="w-4 h-4" />
                  {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Elevation: {position.elevation.toFixed(0)}m | Accuracy: ±{position.accuracy.toFixed(1)}m
                </div>
              </>
            ) : posError ? (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-4 h-4" />
                {posError}
              </div>
            ) : (
              <div className="text-muted-foreground">Waiting for GPS...</div>
            )}
          </div>

          {/* Trail Progress */}
          <div className="bg-muted/50 rounded p-3 space-y-2">
            <div className="text-sm font-medium">Progress</div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${Math.min(Math.max(elevationPct, 0), 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {progress.elevation.toFixed(0)}m of {BCMC_END.ele.toFixed(0)}m
              ({elevationPct.toFixed(0)}%)
            </div>
            <div className="text-xs text-muted-foreground">
              Markers tagged: {collectedCount}/40
            </div>
          </div>

          {/* Marker Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium block">Select Marker</label>
            <select
              value={selectedMarker}
              onChange={(e) => setSelectedMarker(Number(e.target.value))}
              className="w-full px-3 py-2 bg-muted border border-input rounded-md text-sm"
            >
              {MARKERS.map((m) => (
                <option key={m} value={m}>
                  Marker {m}
                  {tags.find((t) => t.marker === m) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Current Tag Info */}
          {currentTag && (
            <div className="bg-muted/50 rounded p-3 text-xs space-y-1">
              <div className="font-medium">Latest tag for marker {currentTag.marker}:</div>
              <div className="text-muted-foreground">
                {currentTag.lat.toFixed(6)}, {currentTag.lng.toFixed(6)}
              </div>
              <div className="text-muted-foreground">
                Elevation: {currentTag.elevation.toFixed(0)}m | Accuracy: ±{currentTag.accuracy.toFixed(1)}m
              </div>
              <div className="text-muted-foreground">
                {new Date(currentTag.timestamp).toLocaleTimeString()}
              </div>
            </div>
          )}

          {/* Tag Button */}
          <button
            onClick={handleTag}
            disabled={!position}
            className="w-full py-3 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
          >
            Tag Marker {selectedMarker}
          </button>

          {/* Export & Clear */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleExport}
              disabled={tags.length === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-muted text-muted-foreground rounded-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-sm"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
            <button
              onClick={handleClear}
              disabled={tags.length === 0}
              className="flex-1 py-2 bg-destructive/10 text-destructive rounded-md disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation text-sm"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
