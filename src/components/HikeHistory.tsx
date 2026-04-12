import { useState } from "react";
import {
  HikeAttempt,
  loadAttempts,
  saveAttempts,
  formatDuration,
  exportHikesAsCsv,
} from "@/lib/hike-store";
import { Trophy, Calendar, Clock, Trash2, BarChart3, Download, ChevronDown, ChevronUp } from "lucide-react";
import HikeComparison from "./HikeComparison";

interface HikeHistoryProps {
  attempts: HikeAttempt[];
  onRefresh: () => void;
}

export default function HikeHistory({ attempts, onRefresh }: HikeHistoryProps) {
  const [comparing, setComparing] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // Segment-time stats per marker across all completed hikes
  const markerStats = new Map<number, { best: number; totalMs: number; count: number }>();
  for (const a of completed) {
    for (let i = 0; i < a.splits.length; i++) {
      const s = a.splits[i];
      if (s.skipped) continue;
      const prev = a.splits[i - 1];
      const seg = prev ? s.elapsed - prev.elapsed : s.elapsed;
      const ex = markerStats.get(s.marker);
      if (!ex) {
        markerStats.set(s.marker, { best: seg, totalMs: seg, count: 1 });
      } else {
        markerStats.set(s.marker, { best: Math.min(ex.best, seg), totalMs: ex.totalMs + seg, count: ex.count + 1 });
      }
    }
  }

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

      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          All Attempts ({completed.length})
        </p>
        <button
          onClick={() => exportHikesAsCsv(completed)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      <div className="space-y-2">
        {completed.map((a) => {
          const isBest = a.id === best?.id;
          const isSelected = comparing.includes(a.id);
          const isExpanded = expandedId === a.id;
          return (
            <div
              key={a.id}
              className={`bg-card border rounded-xl overflow-hidden transition-colors ${
                isSelected ? "border-primary" : "border-border"
              }`}
            >
              {/* Card header — tap to expand */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer touch-manipulation select-none"
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCompare(a.id); }}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs transition-colors touch-manipulation ${
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
                <div className="flex items-center gap-1">
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                    className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 touch-manipulation"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expanded splits */}
              {isExpanded && a.splits.length > 0 && (
                <div className="px-4 pb-4 border-t border-border">
                  {/* Column headers */}
                  <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span />
                    <span className="text-right">This</span>
                    <span className="text-right">Best</span>
                    <span className="text-right">Avg</span>
                  </div>
                  <div className="space-y-0.5">
                    {a.splits.map((s, i) => {
                      const prevSplit = a.splits[i - 1];
                      const seg = prevSplit ? s.elapsed - prevSplit.elapsed : s.elapsed;
                      const stats = !s.skipped ? markerStats.get(s.marker) : undefined;
                      const avg = stats ? Math.round(stats.totalMs / stats.count) : undefined;
                      return (
                        <div
                          key={s.marker}
                          className={`grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 items-center py-1 text-xs ${s.skipped ? "opacity-40" : ""}`}
                        >
                          <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-none ${s.skipped ? "bg-muted text-muted-foreground" : "bg-primary/20 text-primary"}`}>
                            {s.marker}
                          </span>
                          {s.skipped ? (
                            <span className="col-span-3 text-muted-foreground italic text-[10px]">skipped</span>
                          ) : (
                            <>
                              <span className="font-mono-display text-right">{formatDuration(seg)}</span>
                              <span className="font-mono-display text-right text-muted-foreground">
                                {stats ? formatDuration(stats.best) : "—"}
                              </span>
                              <span className="font-mono-display text-right text-muted-foreground">
                                {avg !== undefined ? formatDuration(avg) : "—"}
                              </span>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
