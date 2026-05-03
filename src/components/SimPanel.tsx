import { useEffect, useState } from "react";
import {
  installGpsSimulator,
  uninstallGpsSimulator,
  setSimulatorPaused,
  setSimulatorOptions,
  resetSimulator,
  getSimulatorStatus,
  isSimulatorActive,
} from "@/lib/gps-simulator";
import type { Trail } from "@/lib/trails";
import { Pause, Play, RotateCcw, Power, Zap } from "lucide-react";

interface SimPanelProps {
  trail: Trail;
}

const SPEED_OPTIONS = [
  { label: "1×", mps: 0.6 },     // ~real human pace
  { label: "5×", mps: 3 },
  { label: "20×", mps: 12 },
  { label: "60×", mps: 36 },     // finish 2.5km in ~70s
];

export default function SimPanel({ trail }: SimPanelProps) {
  const [active, setActive] = useState(() => isSimulatorActive());
  const [paused, setPaused] = useState(false);
  const [mps, setMps] = useState(SPEED_OPTIONS[2].mps);
  const [accuracy, setAccuracy] = useState(8);
  const [poorProb, setPoorProb] = useState(0);
  const [status, setStatus] = useState<ReturnType<typeof getSimulatorStatus>>(null);

  // Poll status while active.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setStatus(getSimulatorStatus()), 250);
    return () => clearInterval(id);
  }, [active]);

  // If trail changes while sim is active, restart against the new trail.
  useEffect(() => {
    if (!active) return;
    installGpsSimulator({
      trail,
      metersPerSecond: mps,
      tickMs: 500,
      baseAccuracyM: accuracy,
      poorFixProbability: poorProb,
      poorFixAccuracyM: 60,
    });
    setPaused(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trail.id]);

  const start = () => {
    installGpsSimulator({
      trail,
      metersPerSecond: mps,
      tickMs: 500,
      baseAccuracyM: accuracy,
      poorFixProbability: poorProb,
      poorFixAccuracyM: 60,
    });
    setActive(true);
    setPaused(false);
  };

  const stop = () => {
    uninstallGpsSimulator();
    setActive(false);
    setStatus(null);
  };

  const togglePause = () => {
    const next = !paused;
    setSimulatorPaused(next);
    setPaused(next);
  };

  const onSpeed = (next: number) => {
    setMps(next);
    setSimulatorOptions({ metersPerSecond: next });
  };

  const onAccuracy = (n: number) => {
    setAccuracy(n);
    setSimulatorOptions({ baseAccuracyM: n });
  };

  const onPoorProb = (n: number) => {
    setPoorProb(n);
    setSimulatorOptions({ poorFixProbability: n });
  };

  const pct = status && status.totalM > 0 ? (status.distM / status.totalM) * 100 : 0;

  return (
    <div className="fixed bottom-2 right-2 z-[60] w-[280px] bg-card/95 backdrop-blur border border-border rounded-lg shadow-xl text-xs">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-muted/40 rounded-t-lg">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3 text-amber-500" />
          GPS Sim · {trail.name}
        </div>
        {active ? (
          <button onClick={stop} className="text-destructive hover:text-destructive/80" aria-label="Stop simulator">
            <Power className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={start} className="text-primary font-bold">START</button>
        )}
      </div>
      {active && (
        <div className="p-2.5 space-y-2.5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={togglePause}
              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-muted text-foreground"
            >
              {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button
              onClick={resetSimulator}
              className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground"
              aria-label="Reset to start"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 text-[10px] text-muted-foreground uppercase tracking-widest">
              <span>Speed</span>
              <span>{mps.toFixed(1)} m/s</span>
            </div>
            <div className="flex gap-1">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => onSpeed(opt.mps)}
                  className={`flex-1 py-1 rounded text-[10px] font-bold ${
                    Math.abs(mps - opt.mps) < 0.01
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
              <span>Base accuracy</span>
              <span>{accuracy} m</span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={accuracy}
              onChange={(e) => onAccuracy(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-0.5 text-[10px] text-muted-foreground uppercase tracking-widest">
              <span>Poor-fix prob</span>
              <span>{Math.round(poorProb * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={poorProb}
              onChange={(e) => onPoorProb(Number(e.target.value))}
              className="w-full"
            />
          </div>

          {status && (
            <div className="pt-1 border-t border-border space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{Math.round(status.distM)} m / {Math.round(status.totalM)} m</span>
                <span>{pct.toFixed(0)}%</span>
              </div>
              <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
              <div className="text-[10px] text-muted-foreground">
                trail t = {status.elapsedTrailSec.toFixed(0)}s · watchers = {status.watchers}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
