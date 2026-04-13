import { useState, useEffect, useCallback, useRef } from "react";
import { useGps } from "@/hooks/use-gps";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  HikeAttempt,
  Split,
  MAX_MARKERS,
  TRAIL_DISTANCE_KM,
  TRAIL_ELEVATION_GAIN,
  TRAIL_BASE_ELEVATION,
  formatDuration,
  saveAttempts,
  loadAttempts,
  createAttempt,
  recordMarkerGps,
  saveActiveHike,
  loadActiveHike,
  clearActiveHike,
  GpsCoord,
} from "@/lib/hike-store";
import { Play, Square, Flag, Mountain, MapPin, TrendingUp, SkipForward, Satellite, Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProgressForMarker } from "@/lib/trail-markers";
import TrailProgress from "@/components/TrailProgress";

interface ActiveHikeProps {
  onFinish: () => void;
  onActiveChange?: (active: boolean) => void;
}

const LOCK_HOLD_MS = 3000;
const LOCK_RING_CIRC = 2 * Math.PI * 44; // circumference for r=44 in the centered progress indicator

export default function ActiveHike({ onFinish, onActiveChange }: ActiveHikeProps) {
  const [attempt, setAttempt] = useState<HikeAttempt | null>(() => loadActiveHike());
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(() => loadActiveHike() !== null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);

  const lockHoldRef = useRef<ReturnType<typeof setInterval>>();
  const lockStartRef = useRef<number | null>(null);

  // Notify parent of active state
  useEffect(() => { onActiveChange?.(isRunning); }, [isRunning, onActiveChange]);
  const { position, error: gpsError } = useGps(isRunning);
  useWakeLock(isRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // beforeunload guard
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

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

  // Cleanup lock hold timer on unmount
  useEffect(() => {
    return () => clearInterval(lockHoldRef.current);
  }, []);

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

  // Lock hold: start filling the progress ring; toggle lock after 3s
  const startLockHold = useCallback(() => {
    lockStartRef.current = Date.now();
    lockHoldRef.current = setInterval(() => {
      const held = Date.now() - (lockStartRef.current ?? Date.now());
      const progress = Math.min(100, (held / LOCK_HOLD_MS) * 100);
      setLockProgress(progress);
      if (progress >= 100) {
        clearInterval(lockHoldRef.current);
        lockStartRef.current = null;
        setLockProgress(0);
        setIsLocked((prev) => !prev);
      }
    }, 50);
  }, []);

  const cancelLockHold = useCallback(() => {
    clearInterval(lockHoldRef.current);
    lockStartRef.current = null;
    setLockProgress(0);
  }, []);

  const nextMarker = attempt ? attempt.splits.length + 1 : 1;
  const markerProgress = getProgressForMarker(attempt ? attempt.splits.length : 0);

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
    <div className="flex flex-col h-full relative">
      {/* Timer — sits above the lock overlay so the time stays visible */}
      <div className="flex-none bg-background border-b border-border px-6 py-4 relative z-20">
        <div className="flex items-start justify-between">
          <div className="flex-1 text-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Elapsed</p>
            <p className="text-5xl font-mono-display font-bold text-timer tabular-nums">
              {formatDuration(elapsed)}
            </p>
            <div className="mt-2 space-y-0.5">
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>
                      {Math.round(markerProgress.elevation - TRAIL_BASE_ELEVATION)} m / {TRAIL_ELEVATION_GAIN} m ({markerProgress.elevationPct.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1 text-muted-foreground text-sm">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>
                      {(markerProgress.distanceM / 1000).toFixed(2)} km / {TRAIL_DISTANCE_KM} km ({markerProgress.distancePct.toFixed(0)}%)
                    </span>
                  </div>
                </div>
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

      {/* Trail progress sparklines */}
      <div className="flex-none border-b border-border/40">
        <TrailProgress distancePct={markerProgress.distancePct} />
      </div>

      {/* Marker buttons */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {nextMarker <= MAX_MARKERS ? (
          <>
            <button
              onClick={handleMarker}
              className="w-44 h-44 rounded-full bg-primary/15 border-2 border-primary flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform touch-manipulation select-none"
            >
              <MapPin className="w-10 h-10 text-primary" />
              <span className="text-4xl font-bold text-primary">{nextMarker}</span>
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
      </div>

      {/* Lock overlay — covers marker area; timer header and bottom row sit above it via z-20 */}
      {isLocked && (
        <div className="absolute inset-0 z-10 bg-background/80 flex flex-col items-center justify-center gap-3 pointer-events-auto select-none">
          <Lock className="w-16 h-16 text-muted-foreground" />
          <p className="text-muted-foreground font-semibold text-lg">Screen Locked</p>
          <p className="text-muted-foreground text-xs">Hold the lock button for 3 seconds to unlock</p>
        </div>
      )}

      {/* Centered hold-progress indicator — shown while the user is pressing the lock button */}
      {lockProgress > 0 && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none select-none">
          <div className="bg-background/95 rounded-3xl px-8 py-6 flex flex-col items-center gap-4 shadow-xl">
            <div className="relative w-32 h-32">
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                {/* Track */}
                <circle cx="50" cy="50" r="44" fill="none" strokeWidth="5" className="stroke-muted" />
                {/* Progress arc */}
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={LOCK_RING_CIRC}
                  strokeDashoffset={LOCK_RING_CIRC * (1 - lockProgress / 100)}
                  className={isLocked ? "stroke-emerald-500" : "stroke-primary"}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {isLocked ? (
                  <Unlock className="w-10 h-10 text-muted-foreground" />
                ) : (
                  <Lock className="w-10 h-10 text-muted-foreground" />
                )}
              </div>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {isLocked ? "Keep holding to unlock" : "Keep holding to lock"}
            </p>
          </div>
        </div>
      )}

      {/* Finish + Lock/Unlock row — sits above the overlay */}
      <div className="flex-none px-6 pt-4 pb-4 relative z-20 flex items-center gap-3">
        <Button
          onClick={isLocked ? undefined : handleFinish}
          disabled={isLocked}
          variant="destructive"
          size="lg"
          className="flex-1 gap-2"
        >
          <Square className="w-5 h-5" />
          Finish
        </Button>

        {/* Lock / Unlock button — hold 3s to toggle; progress ring shows centered on screen */}
        <button
          onPointerDown={startLockHold}
          onPointerUp={cancelLockHold}
          onPointerLeave={cancelLockHold}
          onPointerCancel={cancelLockHold}
          className="w-12 h-12 rounded-full bg-muted flex items-center justify-center touch-manipulation select-none flex-shrink-0"
          aria-label={isLocked ? "Hold to unlock" : "Hold to lock"}
        >
          {isLocked ? (
            <Unlock className="w-5 h-5 text-muted-foreground" />
          ) : (
            <Lock className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
      </div>
    </div>
  );
}
