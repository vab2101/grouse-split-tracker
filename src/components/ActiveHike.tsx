import { useState, useEffect, useCallback, useRef } from "react";
import { useGps } from "@/hooks/use-gps";
import {
  HikeAttempt,
  Split,
  BCMC_MARKERS,
  formatDuration,
  formatSplitDiff,
  loadAttempts,
  saveAttempts,
  createAttempt,
} from "@/lib/hike-store";
import { Play, Square, Flag, Mountain, MapPin, Timer, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveHikeProps {
  onFinish: () => void;
}

export default function ActiveHike({ onFinish }: ActiveHikeProps) {
  const [attempt, setAttempt] = useState<HikeAttempt | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const { position, error: gpsError } = useGps(isRunning);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();
  const bestSplits = useRef<Map<number, number>>(new Map());

  // Load best splits from history
  useEffect(() => {
    const attempts = loadAttempts();
    const map = new Map<number, number>();
    for (const a of attempts) {
      for (const s of a.splits) {
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

  const handleStart = useCallback(() => {
    const a = createAttempt();
    setAttempt(a);
    setElapsed(0);
    setIsRunning(true);
  }, []);

  const handleMarker = useCallback(() => {
    if (!attempt || !isRunning) return;
    const nextMarker = attempt.splits.length + 1;
    if (nextMarker > 28) return;

    const now = Date.now();
    const split: Split = {
      marker: nextMarker,
      timestamp: now,
      elapsed: now - attempt.startTime,
      elevation: position?.altitude ?? undefined,
    };

    setAttempt((prev) => (prev ? { ...prev, splits: [...prev.splits, split] } : prev));
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
            2.5 km · 853m elevation · 28 markers
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
          Tap marker buttons as you pass each trail marker. GPS tracks your elevation automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen pb-8">
      {/* Timer */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-6 py-4">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Elapsed</p>
          <p className="text-5xl font-mono-display font-bold text-timer tabular-nums">
            {formatDuration(elapsed)}
          </p>
          {position?.altitude != null && (
            <div className="flex items-center justify-center gap-1 mt-2 text-muted-foreground text-sm">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{Math.round(position.altitude)}m elevation</span>
            </div>
          )}
        </div>
      </div>

      {/* Marker button */}
      <div className="flex-1 flex flex-col items-center px-6 pt-6 gap-6">
        {nextMarker <= 28 ? (
          <button
            onClick={handleMarker}
            className="w-36 h-36 rounded-full bg-primary/15 border-2 border-primary flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
          >
            <MapPin className="w-8 h-8 text-primary" />
            <span className="text-3xl font-bold text-primary">{nextMarker}</span>
            <span className="text-xs text-muted-foreground">Tap at marker</span>
          </button>
        ) : (
          <div className="text-center text-primary">
            <Flag className="w-10 h-10 mx-auto mb-2" />
            <p className="font-semibold">All markers logged!</p>
          </div>
        )}

        {/* Last split info */}
        {lastSplit && (
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

        {/* Splits list */}
        {attempt && attempt.splits.length > 0 && (
          <div className="w-full max-w-sm">
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Splits</h3>
            <div className="space-y-1.5">
              {[...attempt.splits].reverse().map((s, i) => {
                const prevSplit = attempt.splits[attempt.splits.indexOf(s) - 1];
                const segmentTime = prevSplit ? s.elapsed - prevSplit.elapsed : s.elapsed;
                return (
                  <div key={s.marker} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                        {s.marker}
                      </span>
                      <span className="text-muted-foreground">+{formatDuration(segmentTime)}</span>
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
      <div className="px-6 pt-4">
        <Button
          onClick={handleFinish}
          variant="destructive"
          size="lg"
          className="w-full gap-2"
        >
          <Square className="w-5 h-5" />
          Finish Hike
        </Button>
      </div>
    </div>
  );
}
