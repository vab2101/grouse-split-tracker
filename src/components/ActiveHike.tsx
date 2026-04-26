import { useState, useEffect, useCallback, useRef } from "react";
import { useGps } from "@/hooks/use-gps";
import { useWakeLock } from "@/hooks/use-wake-lock";
import {
  HikeAttempt,
  HikeTag,
  Split,
  SplitMode,
  MAX_MARKERS,
  TRAIL_DISTANCE_KM,
  TRAIL_ELEVATION_GAIN,
  TRAIL_BASE_ELEVATION,
  formatDuration,
  saveAttempts,
  loadAttempts,
  createAttempt,
  generateId,
  recordMarkerGps,
  saveActiveHike,
  loadActiveHike,
  clearActiveHike,
  GpsCoord,
} from "@/lib/hike-store";
import { Play, Square, Flag, Mountain, MapPin, TrendingUp, SkipForward, Satellite, Lock, Unlock, Tag as TagIcon, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getProgressForMarker,
  getMarkerPosition,
  isMarkerMissing,
  haversineM,
  snapToMasterTrail,
  interpolateMarkerProgress,
  MarkerProgress,
} from "@/lib/trail-markers";
import TrailProgress from "@/components/TrailProgress";
import MapBackground from "@/components/MapBackground";

interface ActiveHikeProps {
  onFinish: () => void;
  onActiveChange?: (active: boolean) => void;
  onHelpOpen?: () => void;
}

const LOCK_HOLD_MS = 1000;
const UNLOCK_HOLD_MS = 2000;
const LOCK_RING_CIRC = 2 * Math.PI * 44; // circumference for r=44 in the centered progress indicator

// Auto-tracking tunables. Design params from issue #36.
const GPS_ACCURACY_MAX_M = 30; // above this, force Manual mode
const APPROACH_RADIUS_MIN_M = 15;
const APPROACH_RADIUS_ACCURACY_FACTOR = 1.5;
const EXIT_INCREASING_FIXES = 2; // consecutive rising-distance fixes that trigger commit

interface ApproachState {
  marker: number;
  bestDistM: number;
  bestCoord: GpsCoord;
  bestTimestamp: number;
  increasingCount: number;
  inZone: boolean;
  passed: boolean;
}

export default function ActiveHike({ onFinish, onActiveChange, onHelpOpen }: ActiveHikeProps) {
  const [attempt, setAttempt] = useState<HikeAttempt | null>(() => loadActiveHike());
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(() => loadActiveHike() !== null);
  const [isLocked, setIsLocked] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);
  const [startReady, setStartReady] = useState(false);
  const [foregroundCount, setForegroundCount] = useState(0);

  const lockHoldRef = useRef<ReturnType<typeof setInterval>>();
  const lockStartRef = useRef<number | null>(null);

  // Auto-tracking state. Kept in a ref so each GPS update reads/writes synchronously
  // without triggering re-renders per fix.
  const approachRef = useRef<ApproachState | null>(null);
  const [approachInZone, setApproachInZone] = useState(false);
  const [approachPassing, setApproachPassing] = useState(false);

  // Notify parent of active state
  useEffect(() => { onActiveChange?.(isRunning); }, [isRunning, onActiveChange]);
  const { position, error: gpsError } = useGps(isRunning || startReady);
  useWakeLock(isRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // beforeunload guard
  useEffect(() => {
    if (!isRunning) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRunning]);

  // Increment foregroundCount when app returns from background to trigger auto-advance.
  useEffect(() => {
    if (!isRunning) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") setForegroundCount((c) => c + 1);
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
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

  // Derived: next marker number, its known position, and current mode.
  const nextMarker = attempt ? attempt.splits.length + 1 : 1;
  const nextMarkerPos = nextMarker <= MAX_MARKERS ? getMarkerPosition(nextMarker) : null;
  const gpsAccurate = !!position && position.accuracy <= GPS_ACCURACY_MAX_M;
  const userForcedManual = !!attempt?.manualOverride;
  const mode: SplitMode = !userForcedManual && nextMarkerPos && gpsAccurate ? "auto" : "manual";

  // Live distance to the next marker, shown under the marker number while Auto is armed.
  // Prefer along-trail distance (snap current GPS to master trail, subtract from the
  // marker's known trail distance). Fall back to great-circle haversine when the snap
  // says we're past the marker (negative delta).
  const distanceToNextMarkerM: number | null = (() => {
    if (mode !== "auto" || !nextMarkerPos || !position) return null;
    const nextRec = getProgressForMarker(nextMarker);
    const straightM = haversineM(position.latitude, position.longitude, nextMarkerPos.lat, nextMarkerPos.lng);
    if (nextRec.marker !== nextMarker) return straightM;
    const snappedM = snapToMasterTrail(position.latitude, position.longitude).distanceM;
    const trailDeltaM = nextRec.distanceM - snappedM;
    return trailDeltaM > 0 ? trailDeltaM : straightM;
  })();

  const toggleManualOverride = useCallback(() => {
    setAttempt((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, manualOverride: !prev.manualOverride };
      saveActiveHike(updated);
      return updated;
    });
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

  const handleTag = useCallback(() => {
    if (!attempt || !isRunning) return;
    const text = window.prompt("Tag text")?.trim();
    if (!text) return;
    const now = Date.now();
    const tag: HikeTag = {
      id: generateId(),
      timestamp: now,
      elapsed: now - attempt.startTime,
      text,
      coords: currentCoord(),
    };
    setAttempt((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, tags: [...(prev.tags ?? []), tag] };
      saveActiveHike(updated);
      return updated;
    });
  }, [attempt, isRunning, currentCoord]);

  // Reset approach state whenever the target marker changes.
  useEffect(() => {
    approachRef.current = null;
    setApproachInZone(false);
    setApproachPassing(false);
  }, [nextMarker]);

  const commitSplit = useCallback(
    (split: Split) => {
      if (split.coords) recordMarkerGps(split.marker, split.coords);
      setAttempt((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, splits: [...prev.splits, split] };
        saveActiveHike(updated);
        return updated;
      });
      approachRef.current = null;
      setApproachInZone(false);
      setApproachPassing(false);
    },
    []
  );

  // Auto-tracking: on each GPS fix, maintain closest-approach for the next marker
  // and commit when the user exits the approach zone.
  useEffect(() => {
    if (!isRunning || !attempt || !position) return;
    if (nextMarker > MAX_MARKERS) return;
    if (mode !== "auto" || !nextMarkerPos) {
      if (approachRef.current) {
        approachRef.current = null;
        setApproachInZone(false);
        setApproachPassing(false);
      }
      return;
    }

    const distM = haversineM(position.latitude, position.longitude, nextMarkerPos.lat, nextMarkerPos.lng);
    const radius = Math.max(APPROACH_RADIUS_MIN_M, position.accuracy * APPROACH_RADIUS_ACCURACY_FACTOR);
    const coord: GpsCoord = {
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      accuracy: position.accuracy,
    };
    const ts = position.timestamp;

    const state = approachRef.current;

    if (distM <= radius) {
      // In the zone — update best approach.
      if (!state || state.marker !== nextMarker) {
        approachRef.current = {
          marker: nextMarker,
          bestDistM: distM,
          bestCoord: coord,
          bestTimestamp: ts,
          increasingCount: 0,
          inZone: true,
          passed: false,
        };
        setApproachInZone(true);
      } else {
        if (distM < state.bestDistM) {
          state.bestDistM = distM;
          state.bestCoord = coord;
          state.bestTimestamp = ts;
        } else if (!state.passed && distM > state.bestDistM) {
          state.passed = true;
          setApproachPassing(true);
        }
        state.increasingCount = 0;
        state.inZone = true;
        if (!approachInZone) setApproachInZone(true);
      }
      return;
    }

    // Outside the radius.
    if (!state || state.marker !== nextMarker || !state.inZone) return;

    state.increasingCount += 1;
    if (state.increasingCount >= EXIT_INCREASING_FIXES) {
      // Commit the best-approach point as an auto split.
      const split: Split = {
        marker: nextMarker,
        timestamp: state.bestTimestamp,
        elapsed: state.bestTimestamp - attempt.startTime,
        elevation: state.bestCoord.altitude ?? undefined,
        coords: state.bestCoord,
        mode: "auto",
      };
      commitSplit(split);
    }
  }, [position, isRunning, attempt, nextMarker, nextMarkerPos, mode, commitSplit, approachInZone]);

  // Auto-advance: when stuck at a missing marker with accurate GPS, find the closest
  // upcoming known marker and auto-skip to it. Triggered on GPS fixes, GPS accuracy
  // recovery, and app returning to foreground.
  useEffect(() => {
    if (!isRunning || !attempt || !position || !gpsAccurate || userForcedManual) return;
    if (nextMarker > MAX_MARKERS) return;
    if (!isMarkerMissing(nextMarker)) return;

    let closestMarker = -1;
    let closestDist = Infinity;
    for (let m = nextMarker; m <= MAX_MARKERS; m++) {
      const pos = getMarkerPosition(m);
      if (!pos) continue;
      const dist = haversineM(position.latitude, position.longitude, pos.lat, pos.lng);
      if (dist < closestDist) {
        closestDist = dist;
        closestMarker = m;
      }
    }

    if (closestMarker <= nextMarker) return;

    const now = Date.now();
    const newSplits: Split[] = [];
    for (let m = nextMarker; m < closestMarker; m++) {
      newSplits.push({
        marker: m,
        timestamp: now,
        elapsed: now - attempt.startTime,
        elevation: position.altitude ?? undefined,
        skipped: true,
        mode: "manual",
      });
    }

    setAttempt((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, splits: [...prev.splits, ...newSplits] };
      saveActiveHike(updated);
      return updated;
    });
    approachRef.current = null;
    setApproachInZone(false);
  }, [position, gpsAccurate, nextMarker, isRunning, attempt, userForcedManual, foregroundCount]);

  const handleStart = useCallback(() => {
    const a = createAttempt();
    setAttempt(a);
    saveActiveHike(a);
    setElapsed(0);
    setIsRunning(true);
    window.goatcounter?.count({ path: "hike-start", title: "Hike Started", event: true });
    // startCoords is captured from the first GPS fix after start — see the effect below.
  }, []);

  // Capture startCoords from the first GPS fix after Start. GPS only starts watching
  // when isRunning flips to true, so currentCoord() at tap time is stale/null.
  useEffect(() => {
    if (!isRunning || !attempt || attempt.startCoords || !position) return;
    const coord: GpsCoord = {
      latitude: position.latitude,
      longitude: position.longitude,
      altitude: position.altitude,
      accuracy: position.accuracy,
    };
    setAttempt((prev) => {
      if (!prev || prev.startCoords) return prev;
      const updated = { ...prev, startCoords: coord };
      saveActiveHike(updated);
      return updated;
    });
  }, [isRunning, attempt, position]);

  const handleMarker = useCallback(() => {
    if (!attempt || !isRunning) return;
    if (nextMarker > MAX_MARKERS) return;

    const now = Date.now();
    const coord = currentCoord();

    // In Manual mode for a marker with no known position, compute a progress
    // override so the UI doesn't stall at the previous marker's progress.
    let progressOverride: Split["progressOverride"];
    if (mode === "manual" && isMarkerMissing(nextMarker)) {
      let p: MarkerProgress;
      if (coord && gpsAccurate) {
        p = snapToMasterTrail(coord.latitude, coord.longitude);
      } else {
        p = interpolateMarkerProgress(nextMarker);
      }
      progressOverride = {
        distanceM: p.distanceM,
        distancePct: p.distancePct,
        elevation: p.elevation,
        elevationPct: p.elevationPct,
      };
    }

    const split: Split = {
      marker: nextMarker,
      timestamp: now,
      elapsed: now - attempt.startTime,
      elevation: position?.altitude ?? undefined,
      coords: coord,
      mode,
      progressOverride,
    };

    commitSplit(split);
  }, [attempt, isRunning, position, currentCoord, nextMarker, mode, gpsAccurate, commitSplit]);

  const handleForgot = useCallback(() => {
    if (!attempt || !isRunning) return;
    if (nextMarker > MAX_MARKERS) return;

    const now = Date.now();
    const split: Split = {
      marker: nextMarker,
      timestamp: now,
      elapsed: now - attempt.startTime,
      elevation: position?.altitude ?? undefined,
      skipped: true,
      mode: "manual",
      // No coords stored for skipped markers
    };

    commitSplit(split);
  }, [attempt, isRunning, position, nextMarker, commitSplit]);

  const handleFinish = useCallback(() => {
    if (!attempt) return;
    const now = Date.now();
    const endCoords = currentCoord();
    const finished: HikeAttempt = {
      ...attempt,
      endTime: now,
      totalTime: now - attempt.startTime,
      completed: true,
      endCoords: endCoords ?? attempt.endCoords,
    };
    setIsRunning(false);
    setStartReady(false);
    const attempts = loadAttempts();
    saveAttempts([finished, ...attempts]);
    clearActiveHike();
    setAttempt(null);
    onFinish();
  }, [attempt, onFinish, currentCoord]);

  // Lock hold: start filling the progress ring; toggle lock after hold duration
  const startLockHold = useCallback(() => {
    const holdMs = isLocked ? UNLOCK_HOLD_MS : LOCK_HOLD_MS;
    lockStartRef.current = Date.now();
    lockHoldRef.current = setInterval(() => {
      const held = Date.now() - (lockStartRef.current ?? Date.now());
      const progress = Math.min(100, (held / holdMs) * 100);
      setLockProgress(progress);
      if (progress >= 100) {
        clearInterval(lockHoldRef.current);
        lockStartRef.current = null;
        setLockProgress(0);
        setIsLocked((prev) => !prev);
      }
    }, 50);
  }, [isLocked]);

  const cancelLockHold = useCallback(() => {
    clearInterval(lockHoldRef.current);
    lockStartRef.current = null;
    setLockProgress(0);
  }, []);

  // Resolve progress from the last split: honour any progressOverride (Manual mode
   // for missing markers), otherwise fall back to the marker-number lookup.
  const markerProgress: MarkerProgress = (() => {
    const lastSplit = attempt && attempt.splits.length > 0 ? attempt.splits[attempt.splits.length - 1] : null;
    if (lastSplit?.progressOverride) {
      return {
        marker: lastSplit.marker,
        ...lastSplit.progressOverride,
      };
    }
    return getProgressForMarker(attempt ? attempt.splits.length : 0);
  })();

  // Pre-start view
  if (!isRunning && !attempt) {
    const gpsColor = position
      ? position.accuracy <= 10 ? "text-success" : position.accuracy <= 25 ? "text-warning" : "text-destructive"
      : "text-muted-foreground";

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

        {gpsError && startReady && (
          <div className="bg-destructive/10 text-destructive px-4 py-2 rounded-lg text-sm text-center">
            GPS: {gpsError}
          </div>
        )}

        {onHelpOpen && (
          <button
            onClick={onHelpOpen}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:bg-accent touch-manipulation select-none"
          >
            <HelpCircle className="w-4 h-4" />
            Instructions
          </button>
        )}

        {!startReady ? (
          <Button
            onClick={() => setStartReady(true)}
            size="lg"
            variant="secondary"
            className="w-48 h-48 rounded-full text-xl font-bold gap-3 flex-col"
          >
            <MapPin className="w-10 h-10" />
            In Parking Lot
          </Button>
        ) : (
          <div className="relative inline-block">
            <Button
              onClick={handleStart}
              size="lg"
              className="w-48 h-48 rounded-full text-2xl font-bold gap-3 flex-col"
            >
              <Play className="w-10 h-10" />
              START
            </Button>
            <div className="absolute top-0 right-0 flex items-center gap-1 bg-background/90 backdrop-blur-sm border border-border/60 rounded-full px-2 py-0.5 pointer-events-none">
              {position ? (
                <>
                  <Satellite className={`w-3.5 h-3.5 ${gpsColor}`} />
                  <span className={`text-xs ${gpsColor}`}>{Math.round(position.accuracy)}m</span>
                </>
              ) : (
                <>
                  <Satellite className="w-3.5 h-3.5 text-muted-foreground animate-pulse" />
                  <span className="text-xs text-muted-foreground">No GPS</span>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-muted-foreground text-xs text-center max-w-xs">
          Tap marker buttons as you pass each BCMC trail marker. Hit "Forgot" if you missed one. Finish at the Grouse lodge timer card scan.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full relative${isLocked ? " hike-screen-locked" : ""}`}>
      {/* Timer — sits above the lock overlay so the time stays visible */}
      <div className="flex-none bg-background border-b border-border px-6 py-4 relative z-20">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1 text-center">Elapsed</p>
            <div className="flex justify-center gap-12">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-0.5">total</p>
                <p className="text-4xl font-mono-display font-bold text-timer tabular-nums">
                  {formatDuration(elapsed)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-0.5">
                  {attempt && attempt.splits.length > 0
                    ? `since marker ${attempt.splits[attempt.splits.length - 1].marker}`
                    : "since start"}
                </p>
                <p className="text-4xl font-mono-display font-bold text-timer tabular-nums">
                  {attempt && attempt.splits.length > 0
                    ? formatDuration(elapsed - attempt.splits[attempt.splits.length - 1].elapsed)
                    : formatDuration(elapsed)}
                </p>
              </div>
            </div>
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

      {/* Single centered elevation sparkline — replaces the old elev+route pair */}
      <div className="flex-none bg-background border-b border-white/[0.04] relative z-20">
        <TrailProgress distancePct={markerProgress.distancePct} />
      </div>

      {/* Map fills the middle region; marker + forgot buttons are centered over it */}
      <div className="flex-1 relative overflow-hidden bg-background">
        <MapBackground progress={markerProgress.distancePct / 100} />
        <div className="map-vignette" />

        {/* Manual-override toggle — top-left of map area, away from right-thumb reach */}
        <button
          onClick={toggleManualOverride}
          disabled={isLocked}
          aria-label={userForcedManual ? "Switch to automatic marker logging" : "Force manual marker logging"}
          className={`absolute left-3 top-3 z-[5] flex items-center gap-2 px-3 py-2 rounded-lg text-xs uppercase tracking-widest font-semibold touch-manipulation select-none border backdrop-blur-sm transition-colors ${
            userForcedManual
              ? "bg-warning/20 border-warning/50 text-warning"
              : "bg-background/70 border-white/[0.08] text-muted-foreground"
          }`}
        >
          <span className={`w-8 h-4 rounded-full relative transition-colors ${userForcedManual ? "bg-warning/70" : "bg-muted-foreground/40"}`}>
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-background shadow transition-all ${userForcedManual ? "left-[18px]" : "left-0.5"}`} />
          </span>
          {userForcedManual ? "Manual" : "Auto"}
        </button>

        {/* Tag button — bottom-left of map area */}
        <button
          onClick={isLocked ? undefined : handleTag}
          disabled={isLocked}
          aria-label="Add tag"
          className="absolute left-3 bottom-3 z-[5] w-12 h-12 rounded-full bg-background/70 backdrop-blur-sm border border-white/[0.08] flex items-center justify-center touch-manipulation select-none disabled:opacity-40"
        >
          <TagIcon className="w-5 h-5 text-muted-foreground" />
        </button>

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 pointer-events-none">
          {nextMarker <= MAX_MARKERS ? (
            <>
              <button
                onClick={handleMarker}
                className="marker-btn-translucent pointer-events-auto w-44 h-44 rounded-full bg-primary/[0.18] border-2 border-primary flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform touch-manipulation select-none"
              >
                <span className={`text-[10px] uppercase tracking-widest font-semibold ${mode === "auto" ? "text-primary" : "text-warning"}`}>
                  {mode === "auto" ? "Auto" : "Manual"}
                </span>
                <MapPin className="w-8 h-8 text-primary" />
                {approachInZone && mode === "auto" ? (
                  <>
                    <span className="text-xl font-bold text-primary">
                      {approachPassing ? "Passing" : "Approaching"}
                    </span>
                    <span className="text-3xl font-bold text-primary leading-none">{nextMarker}</span>
                  </>
                ) : (
                  <>
                    <span className="text-4xl font-bold text-primary leading-none">{nextMarker}</span>
                    <span className="text-xs text-muted-foreground min-h-[1rem]">
                      {mode === "auto"
                        ? distanceToNextMarkerM != null
                          ? `~${Math.round(distanceToNextMarkerM)} m to marker`
                          : "\u00A0"
                        : "Tap at marker"}
                    </span>
                  </>
                )}
              </button>

              <button
                onClick={handleForgot}
                className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-lg bg-muted/70 text-muted-foreground text-sm border border-white/[0.05] backdrop-blur-sm active:scale-95 transition-transform touch-manipulation select-none"
              >
                <SkipForward className="w-4 h-4" />
                Forgot marker {nextMarker}
              </button>
            </>
          ) : (
            <div className="pointer-events-auto text-center text-primary bg-background/70 backdrop-blur-sm rounded-xl px-5 py-4">
              <Flag className="w-10 h-10 mx-auto mb-2" />
              <p className="font-semibold">All markers logged!</p>
            </div>
          )}
        </div>
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
