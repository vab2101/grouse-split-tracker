import { useState } from "react";
import {
  HikeAttempt,
  loadAttempts,
  saveAttempts,
  formatDuration,
} from "@/lib/hike-store";
import { Trophy, Calendar, Clock, ChevronRight, Trash2, BarChart3 } from "lucide-react";
import HikeComparison from "./HikeComparison";

interface HikeHistoryProps {
  attempts: HikeAttempt[];
  onRefresh: () => void;
}

export default function HikeHistory({ attempts, onRefresh }: HikeHistoryProps) {
  const [comparing, setComparing] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  const completed = attempts.filter((a) => a.completed && a.totalTime);
  const best = completed.length
    ? completed.reduce((a, b) => (a.totalTime! < b.totalTime! ? a : b))
    : null;

  const toggleCompare = (id: string) => {
    setComparing((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const handleDelete = (id: string) => {
    const updated = loadAttempts().filter((a) => a.id !== id);
    saveAttempts(updated);
    onRefresh();
  };

  if (showComparison && comparing.length >= 2) {
    const selected = comparing.map((id) => attempts.find((a) => a.id === id)!).filter(Boolean);
    return (
      <div>
        <button
          onClick={() => setShowComparison(false)}
          className="text-sm text-primary mb-4 px-6"
        >
          ← Back to history
        </button>
        <HikeComparison attempts={selected} />
      </div>
    );
  }

  if (completed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
        <Clock className="w-12 h-12 opacity-40" />
        <p className="text-sm">No hikes recorded yet</p>
        <p className="text-xs">Start your first BCMC attempt!</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4">
      {/* Best time */}
      {best && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex items-center gap-4">
          <Trophy className="w-8 h-8 text-accent" />
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-widest">Personal Best</p>
            <p className="text-2xl font-mono-display font-bold text-primary">
              {formatDuration(best.totalTime!)}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(best.date).toLocaleDateString()}
            </p>
          </div>
        </div>
      )}

      {/* Compare button */}
      {comparing.length >= 2 && (
        <button
          onClick={() => setShowComparison(true)}
          className="w-full mb-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Compare {comparing.length} Hikes
        </button>
      )}

      <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
        All Attempts ({completed.length})
      </p>

      <div className="space-y-2">
        {completed.map((a) => {
          const isBest = a.id === best?.id;
          const isSelected = comparing.includes(a.id);
          return (
            <div
              key={a.id}
              className={`bg-card border rounded-xl p-4 transition-colors ${
                isSelected ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => toggleCompare(a.id)}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs transition-colors ${
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    }`}
                  >
                    {isSelected && "✓"}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-display font-bold text-lg">
                        {formatDuration(a.totalTime!)}
                      </span>
                      {isBest && (
                        <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-semibold uppercase">
                          Best
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Calendar className="w-3 h-3" />
                      {new Date(a.date).toLocaleDateString("en-CA", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      <span>· {a.splits.length} markers</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-muted-foreground/40 hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
