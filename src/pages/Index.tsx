import { useState, useCallback, useEffect } from "react";
import { Mountain, History, Play, HelpCircle } from "lucide-react";
import ActiveHike from "@/components/ActiveHike";
import HikeHistory from "@/components/HikeHistory";
import HelpModal from "@/components/HelpModal";
import { loadAttempts, HikeAttempt } from "@/lib/hike-store";

type Tab = "track" | "history";

export default function Index() {
  const [tab, setTab] = useState<Tab>("track");
  const [attempts, setAttempts] = useState<HikeAttempt[]>(() => loadAttempts());
  const [hikeActive, setHikeActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

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

  return (
    <div className="h-screen flex flex-col max-w-md mx-auto relative">
      {/* Help button — always visible top-left */}
      <button
        onClick={() => setHelpOpen(true)}
        className="absolute top-2 left-2 z-50 w-8 h-8 rounded-full bg-card/80 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground touch-manipulation select-none"
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      <HelpModal open={helpOpen} onOpenChange={setHelpOpen} />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === "track" ? (
          <ActiveHike onFinish={() => { setHikeActive(false); refresh(); setTab("history"); }} onActiveChange={setHikeActive} />
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
