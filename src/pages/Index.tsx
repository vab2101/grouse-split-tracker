import { useState, useCallback, useEffect } from "react";
import { History, Play } from "lucide-react";
import ActiveHike from "@/components/ActiveHike";
import HikeHistory from "@/components/HikeHistory";
import HelpModal from "@/components/HelpModal";
import SimPanel from "@/components/SimPanel";
import {
  loadAttempts,
  HikeAttempt,
  loadActiveTrailId,
  saveActiveTrailId,
} from "@/lib/hike-store";
import { getTrail, type TrailId } from "@/lib/trails";

type Tab = "track" | "history";

export default function Index() {
  const [tab, setTab] = useState<Tab>("track");
  const [attempts, setAttempts] = useState<HikeAttempt[]>(() => loadAttempts());
  const [hikeActive, setHikeActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [trailId, setTrailId] = useState<TrailId>(() => loadActiveTrailId());
  const trail = getTrail(trailId);

  useEffect(() => {
    screen.orientation?.lock?.("portrait")?.catch(() => {});
  }, []);

  const refresh = useCallback(() => setAttempts(loadAttempts()), []);

  const guardedSetTab = useCallback((t: Tab) => {
    if (t !== "track" && hikeActive) {
      if (!window.confirm("You have an active hike. Switch tabs?")) return;
    }
    if (t === "history") refresh();
    setTab(t);
  }, [hikeActive, refresh]);

  const handleTrailChange = useCallback((next: TrailId) => {
    setTrailId(next);
    saveActiveTrailId(next);
  }, []);

  return (
    <div className="h-screen flex flex-col max-w-md mx-auto relative">
      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Dev-only GPS simulator. Tree-shaken in prod by Vite when DEV is false. */}
      {import.meta.env.DEV && <SimPanel trail={trail} />}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "track" ? (
          <ActiveHike
            trail={trail}
            onFinish={() => { setHikeActive(false); refresh(); setTab("history"); }}
            onActiveChange={setHikeActive}
            onHelpOpen={() => setHelpOpen(true)}
            trailSwitch={
              <TrailSwitch value={trailId} onChange={handleTrailChange} />
            }
          />
        ) : (
          <HikeHistory attempts={attempts} onRefresh={refresh} />
        )}
      </div>

      {/* Bottom nav — hidden during active hike */}
      {!hikeActive && (
        <nav className="flex-none bg-card border-t border-border">
          <div className="flex">
            <button
              onClick={() => guardedSetTab("track")}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors touch-manipulation select-none ${
                tab === "track" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Play className="w-5 h-5" />
              Track
            </button>
            <button
              onClick={() => guardedSetTab("history")}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors touch-manipulation select-none ${
                tab === "history" ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <History className="w-5 h-5" />
              History
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

interface TrailSwitchProps {
  value: TrailId;
  onChange: (id: TrailId) => void;
}

function TrailSwitch({ value, onChange }: TrailSwitchProps) {
  const isBcmc = value === "bcmc";
  return (
    <div
      role="tablist"
      aria-label="Select trail"
      className="relative flex items-center bg-card/80 border border-border rounded-full p-1 backdrop-blur-sm"
    >
      <span
        aria-hidden
        className="trail-switch-indicator absolute top-1 bottom-1 rounded-full"
        style={{
          width: "calc(50% - 4px)",
          transform: isBcmc ? "translateX(0%)" : "translateX(100%)",
        }}
      />
      <button
        role="tab"
        aria-selected={isBcmc}
        onClick={() => onChange("bcmc")}
        className={`relative z-10 px-4 py-2 text-xs font-bold tracking-wide rounded-full transition-colors touch-manipulation select-none ${
          isBcmc ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        BCMC
      </button>
      <button
        role="tab"
        aria-selected={!isBcmc}
        onClick={() => onChange("grind")}
        className={`relative z-10 px-4 py-2 text-xs font-bold tracking-wide rounded-full transition-colors touch-manipulation select-none ${
          !isBcmc ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        GRIND
      </button>
    </div>
  );
}
