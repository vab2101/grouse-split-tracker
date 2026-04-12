import { useState, useEffect, useCallback, useRef } from "react";
import { useGps } from "@/hooks/use-gps";
import {
  HikeAttempt,
  Split,
  MAX_MARKERS,
  TRAIL_DISTANCE_KM,
  TRAIL_ELEVATION_GAIN,
  TRAIL_BASE_ELEVATION,
  formatDuration,
  formatSplitDiff,
  loadAttempts,
  saveAttempts,
  createAttempt,
  recordMarkerGps,
  saveActiveHike,
  loadActiveHike,
  clearActiveHike,
  GpsCoord,
} from "@/lib/hike-store";
import { Play, Square, Flag, Mountain, MapPin, TrendingUp, SkipForward, Satellite } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveHikeProps {
  onFinish: () => void;
  onActiveChange?: (active: boolean) => void;
}

export default function ActiveHike({ onFinish, onActiveChange }: ActiveHikeProps) {
  const [attempt, setAttempt] = useState<HikeAttempt | null>(() => loadActiveHike());
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(() => loadActiveHike() !== null);

  // Notify parent of active state
  useEffect(() => { onActiveChange?.(isRunning); }, [isRunning, onActiveChange]);
  const { position, error: gpsError } = useGps(isRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const bestSplits = useRef<Map<number, number>>(new Map());

  // beforeunload guard
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  // Load best splits from history
  useEffect(() => {
    const attempts = loadAttempts();
    const map = new Map<number, number>();
    for (const a of attempts) {
      for (const s of a.splits) {
        if (s.skipped) continue;
        const current = map.get(s.marker);
        if (current === undefined || s.elapsed < current) {
          map.set(s.marker, s.elapsed);
        }
      }
    }
    bestSplits.current = map;
  }, []);

  // Timer
  useEffect(() => {
    if (isRunning && attempt) {
      intervalRef.current = setInterval(() => {
        setElapsed(Date.now() - attempt.startTime);
      }, 100);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, attempt]);

  // Record elevation
  useEffect(() => {
    if (isRunning && attempt && position?.altitude != null) {
      setAttempt((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          elevationData: [
            ...prev.elevationData,
            { time: Date.now() - prev.startTime, elevation: position.altitude! },
          ],
        };
      });
    }
  }, [position, isRunning]);

  const currentCoord = useCallback((): GpsCoord | undefined => {
    if (!position) return undefined;
    return {
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      accuracy: position.accuracy,
    };
  }, [position]);

  const handleStart = useCallback(() => {
    const a = createAttempt();
    setAttempt(a);
    saveActiveHike(a);
    setElapsed(0);
    setIsRunning(true);
  }, []);

  const handleMarker = useCallback(() => {
    if (!attempt || !isRunning) return;
    const nextMarker = attempt.splits.length + 1;
    if (nextMarker > MAX_MARKERS) return;

    const now = Date.now();
    const coord = currentCoord();
    const split: Split = {
      marker: nextMarker,
      timestamp: now,
      elapsed: now - attempt.startTime,
      elevation: position?.altitude ?? undefined,
      coords: coord,
    };

    // Save GPS data for this marker
    if (coord) {
      recordMarkerGps(nextMarker, coord);
    }

    setAttempt((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, splits: [...prev.splits, split] };
      saveActiveHike(updated);
      return updated;
    });
  }, [attempt, isRunning, position, currentCoord]);

  const handleForgot = useCallback(() => {
    if (!attempt || !isRunning) return;
    const nextMarker = attempt.splits.length + 1;
    if (nextMarker > MAX_MARKERS) return;

    const now = Date.now();
    const split: Split = {
      marker: nextMarker,
      timestamp: now,
      elapsed: now - attempt.startTime,
      elevation: position?.altitude ?? undefined,
      skipped: true,
      // No coords stored for skipped markers
    };

    setAttempt((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, splits: [...prev.splits, split] };
      saveActiveHike(updated);
      return updated;
    });
  }, [attempt, isRunning, position]);

  const handleFinish = useCallback(() => {
    if (!attempt) return;
    const now = Date.now();
    const finished: HikeAttempt = {
      ...attempt,
      endTime: now,
      totalTime: now - attempt.startTime,
      completed: true,
    };
    setIsRunning(false);
    const attempts = loadAttempts();
    saveAttempts([finished, ...attempts]);
    clearActiveHike();
    setAttempt(null);
    onFinish();
  }, [attempt, onFinish]);

  const nextMarker = attempt ? attempt.splits.length + 1 : 1;
  const lastSplit = attempt?.splits[attempt.splits.length - 1];

  // Pre-start view
  if (!isRunning && !attempt) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-8 px-6">
        <div className="flex flex-col items-center gap-3">
          <Mountain className="w-16 h-16 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">BCMC Trail</h1>
          <p className="text-muted-foreground text-center text-sm">
            {TRAIL_DISTANCE_KM} km · {TRAIL_ELEVATION_GAIN}m elevation gain
          </p>
          <p className="text-muted-foreground text-center text-xs">
            Start at Grouse Grind timer card trailhead scan
          </p>
        </div>

        {gpsError && (
          <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-lg text-sm text-center">
            GPS: {gpsError}
          </div>
        )}

        <Button
          onClick={handleStart}
          size="lg"
          className="w-48 h-48 rounded-full text-2xl font-bold gap-3 flex-col"
        >
          <Play className="w-10 h-10" />
          START
        </Button>

        <p className="text-muted-foreground text-xs text-center max-w-xs">
          Tap marker buttons as you pass each BCMC trail marker. Hit "Forgot" if you missed one. Finish at the Grouse lodge timer card scan.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Timer */}
      <div className="flex-none bg-background border-b border-border px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Elapsed</p>
            <p className="text-5xl font-mono-display font-bold text-timer tabular-nums">
              {formatDuration(elapsed)}
            </p>
            {position?.altitude != null && (() => {
              const ec = Math.min(TRAIL_ELEVATION_GAIN, Math.max(0, Math.round(position.altitude! - TRAIL_BASE_ELEVATION)));
              const ep = Math.min(100, Math.round((ec / TRAIL_ELEVATION_GAIN) * 100));
              const dc = Math.min(TRAIL_DISTANCE_KM, parseFloat((TRAIL_DISTANCE_KM * (ec / TRAIL_ELEVATION_GAIN)).toFixed(1)));
              const dp = Math.min(100, Math.round((dc / TRAIL_DISTANCE_KM) * 100));
              return (
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>{ec} m / {TRAIL_ELEVATION_GAIN} m ({ep}%)</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{dc.toFixed(1)} km / {TRAIL_DISTANCE_KM} km ({dp}%)</span>
                  </div>
                </div>
              );
            })()}
          </div>
          {/* GPS accuracy indicator */}
          <div className="flex items-center gap-1 pt-1">
            {position ? (
              <>
                <Satellite className={`w-4 h-4 ${position.accuracy <= 10 ? "text-success" : position.accuracy <= 25 ? "text-warning" : "text-destructive"}`} />
                <span className={`text-xs ${position.accuracy <= 10 ? "text-success" : position.accuracy <= 25 ? "text-warning" : "text-destructive"}`}>
                  {Math.round(position.accuracy)}m
                </span>
              </>
            ) : (
              <>
                <Satellite className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">No GPS</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Marker buttons */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-6 pt-6 gap-4 pb-4">
        {nextMarker <= MAX_MARKERS ? (
          <>
            <button
              onClick={handleMarker}
              className="w-36 h-36 rounded-full bg-primary/15 border-2 border-primary flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform touch-manipulation select-none"
            >
              <MapPin className="w-8 h-8 text-primary" />
              <span className="text-3xl font-bold text-primary">{nextMarker}</span>
              <span className="text-xs text-muted-foreground">Tap at marker</span>
            </button>

            <button
              onClick={handleForgot}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm active:scale-95 transition-transform touch-manipulation select-none"
            >
              <SkipForward className="w-4 h-4" />
              Forgot marker {nextMarker}
            </button>
          </>
        ) : (
          <div className="text-center text-primary">
            <Flag className="w-10 h-10 mx-auto mb-2" />
            <p className="font-semibold">All markers logged!</p>
          </div>
        )}

        {/* Last split info */}
        {lastSplit && !lastSplit.skipped && (
          <div className="bg-card border border-border rounded-xl p-4 w-full max-w-sm">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Marker {lastSplit.marker}</span>
              <span className="font-mono-display font-semibold">{formatDuration(lastSplit.elapsed)}</span>
            </div>
            {(() => {
              const diff = formatSplitDiff(lastSplit.elapsed, bestSplits.current.get(lastSplit.marker));
              if (!diff) return null;
              return (
                <p className={`text-xs mt-1 text-right ${diff.positive ? "text-success" : "text-destructive"}`}>
                  {diff.text} vs best
                </p>
              );
            })()}
          </div>
        )}
        {lastSplit?.skipped && (
          <div className="bg-muted/30 border border-border rounded-xl p-3 w-full max-w-sm text-center text-xs text-muted-foreground">
            Marker {lastSplit.marker} skipped (forgot)
          </div>
        )}

        {/* Splits list */}
        {attempt && attempt.splits.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Splits</h3>
            <div className="space-y-1.5">
              {[...attempt.splits].reverse().map((s) => {
                const prevSplit = attempt.splits[attempt.splits.indexOf(s) - 1];
                const segmentTime = prevSplit ? s.elapsed - prevSplit.elapsed : s.elapsed;
                return (
                  <div key={s.marker} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${s.skipped ? "bg-muted/20 opacity-50" : "bg-muted/50"}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${s.skipped ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"}`}>
                        {s.marker}
                      </span>
                      {s.skipped ? (
                        <span className="text-muted-foreground italic text-xs">skipped</span>
                      ) : (
                        <span className="text-muted-foreground">+{formatDuration(segmentTime)}</span>
                      )}
                    </div>
                    <span className="font-mono-display text-xs">{formatDuration(s.elapsed)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Finish button */}
      <div className="flex-none px-6 pt-4 pb-4">
        <Button
          onClick={handleFinish}
          variant="destructive"
          size="lg"
          className="w-full gap-2"
        >
          <Square className="w-5 h-5" />
          Finish
        </Button>
      </div>
    </div>
  );
}
