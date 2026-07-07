import { useEffect, useState } from "react";
import {
  HikeAttempt,
  loadAttempts,
  saveAttempts,
  formatDuration,
  exportHikesAsCsv,
  exportGpsTracksAsCsv,
  attemptTrailId,
  loadHistoryFilter,
  saveHistoryFilter,
} from "@/lib/hike-store";
import { TRAILS, type TrailId } from "@/lib/trails";
import { Trophy, Calendar, Clock, Trash2, Download, ChevronDown, ChevronUp, Tag as TagIcon, MoreVertical, MapPin, ArrowRight } from "lucide-react";
import HikeComparison from "./HikeComparison";
import HikeReport from "./HikeReport";

interface HikeHistoryProps {
  attempts: HikeAttempt[];
  onRefresh: () => void;
}

const ALL_TRAIL_IDS: TrailId[] = ["bcmc", "grind"];

export default function HikeHistory({ attempts, onRefresh }: HikeHistoryProps) {
  const [comparing, setComparing] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrailId[]>(() => loadHistoryFilter());
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => { saveHistoryFilter(filter); }, [filter]);

  // Close overflow menu on any outside interaction. Defer listener attach by one
  // tick so the same native click that opened the menu doesn't immediately close it
  // (React's stopPropagation only stops the synthetic event, not native bubble).
  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    const id = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener("click", close);
    };
  }, [menuOpenId]);

  const completed = attempts.filter((a) => a.completed && a.totalTime);
  const visible = completed.filter((a) => filter.includes(attemptTrailId(a)));
  // Newest first.
  visible.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Per-trail personal best.
  const bestByTrail = new Map<TrailId, HikeAttempt>();
  for (const a of completed) {
    const tid = attemptTrailId(a);
    const cur = bestByTrail.get(tid);
    if (!cur || a.totalTime! < cur.totalTime!) bestByTrail.set(tid, a);
  }

  const toggleCompare = (id: string) => {
    setComparing((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const toggleFilter = (id: TrailId) => {
    setFilter((prev) => {
      if (prev.includes(id)) {
        // Don't allow unchecking the last one — keeps something visible.
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    // Drop comparison selections that fall out of view.
    setComparing((prev) => prev.filter((cid) => {
      const a = attempts.find((x) => x.id === cid);
      if (!a) return false;
      const next = filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id];
      return next.includes(attemptTrailId(a));
    }));
  };

  const handleDelete = (id: string) => {
    const updated = loadAttempts().filter((a) => a.id !== id);
    saveAttempts(updated);
    onRefresh();
  };

  const handleDeleteSelected = () => {
    if (comparing.length === 0) return;
    const n = comparing.length;
    if (!window.confirm(`Delete ${n} hike${n === 1 ? "" : "s"}? This cannot be undone.`)) return;
    const idSet = new Set(comparing);
    saveAttempts(loadAttempts().filter((a) => !idSet.has(a.id)));
    setComparing([]);
    onRefresh();
  };

  // Per-(trail, marker) segment stats so markers from different trails don't mix.
  const markerStats = new Map<string, { best: number; totalMs: number; count: number }>();
  const key = (tid: TrailId, m: number) => `${tid}:${m}`;
  for (const a of completed) {
    const tid = attemptTrailId(a);
    const trail = TRAILS[tid];
    for (let i = 0; i < a.splits.length; i++) {
      const s = a.splits[i];
      if (s.skipped) continue;
      const prev = a.splits[i - 1];
      const seg = prev ? s.elapsed - prev.elapsed : s.elapsed;
      const k = key(tid, s.marker);
      const ex = markerStats.get(k);
      if (!ex) markerStats.set(k, { best: seg, totalMs: seg, count: 1 });
      else markerStats.set(k, { best: Math.min(ex.best, seg), totalMs: ex.totalMs + seg, count: ex.count + 1 });
    }
    if (a.splits.length > 0 && a.totalTime) {
      const lastSplit = a.splits[a.splits.length - 1];
      if (!lastSplit.skipped) {
        const finishSeg = a.totalTime - lastSplit.elapsed;
        const k = key(tid, trail.finishMarker);
        const ex = markerStats.get(k);
        if (!ex) markerStats.set(k, { best: finishSeg, totalMs: finishSeg, count: 1 });
        else markerStats.set(k, { best: Math.min(ex.best, finishSeg), totalMs: ex.totalMs + finishSeg, count: ex.count + 1 });
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
        <p className="text-xs">Start your first attempt!</p>
      </div>
    );
  }

  // Block compare if selections span multiple trails.
  const compareTrailIds = new Set(
    comparing
      .map((id) => attempts.find((a) => a.id === id))
      .filter((a): a is HikeAttempt => !!a)
      .map(attemptTrailId)
  );
  const compareMixed = compareTrailIds.size > 1;

  return (
    <div className="px-6 py-4 pb-28 relative">
      {/* Title row */}
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-2xl font-extrabold tracking-tight">History</h1>
        <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">
          {completed.length} hike{completed.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Per-trail personal bests — gradient cards */}
      {ALL_TRAIL_IDS.filter((tid) => filter.includes(tid) && bestByTrail.has(tid)).map((tid) => {
        const best = bestByTrail.get(tid)!;
        const isGrind = tid === "grind";
        return (
          <div
            key={tid}
            className={`${isGrind ? "pb-card-accent" : "pb-card-primary"} rounded-2xl p-4 mb-2 flex items-center gap-4`}
          >
            <span
              className={`w-12 h-12 rounded-xl flex items-center justify-center flex-none border ${
                isGrind
                  ? "bg-accent/15 border-accent/35 text-accent"
                  : "bg-accent/15 border-accent/35 text-accent"
              }`}
              style={{ boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.08)" }}
            >
              <Trophy className="w-6 h-6" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground flex items-center gap-1.5">
                <TrailBadge trailId={tid} />
                Personal Best
              </p>
              <p
                className={`text-3xl font-mono-display font-bold leading-tight tabular-nums ${
                  isGrind ? "text-accent" : "text-primary"
                }`}
              >
                {formatDuration(best.totalTime!)}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(best.date).toLocaleDateString()}
              </p>
            </div>
          </div>
        );
      })}

      {/* Filter chips */}
      <div className="mt-4 mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Show</span>
        {ALL_TRAIL_IDS.map((tid) => {
          const checked = filter.includes(tid);
          const onlyOne = filter.length === 1 && checked;
          return (
            <button
              key={tid}
              type="button"
              onClick={() => toggleFilter(tid)}
              disabled={onlyOne}
              aria-pressed={checked}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-full border text-[13px] font-bold min-h-[36px] active:scale-[0.96] transition-all touch-manipulation select-none ${
                checked
                  ? "filter-chip-active text-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              } ${onlyOne ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              <span
                className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                  checked
                    ? "bg-primary text-primary-foreground"
                    : "border-[1.5px] border-muted-foreground/50"
                }`}
              >
                {checked && "✓"}
              </span>
              {TRAILS[tid].name}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mt-5 mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          All Attempts · {visible.length}{visible.length !== completed.length ? ` of ${completed.length}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportHikesAsCsv(visible)}
            aria-label="Export splits CSV"
            title="Export splits CSV"
            className="w-9 h-9 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 flex items-center justify-center touch-manipulation"
            style={{ boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.04)" }}
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={comparing.length === 0}
            aria-label="Delete selected hikes"
            title={comparing.length === 0 ? "Select hikes to delete" : `Delete ${comparing.length} selected hike${comparing.length === 1 ? "" : "s"}`}
            className="w-9 h-9 rounded-xl border flex items-center justify-center touch-manipulation transition-colors disabled:bg-card disabled:border-border disabled:text-muted-foreground disabled:opacity-40 enabled:bg-destructive/15 enabled:border-destructive/45 enabled:text-destructive enabled:hover:bg-destructive/25"
            style={{ boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.04)" }}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((a) => {
          const tid = attemptTrailId(a);
          const trail = TRAILS[tid];
          const isBest = a.id === bestByTrail.get(tid)?.id;
          const isSelected = comparing.includes(a.id);
          const isExpanded = expandedId === a.id;
          return (
            <div
              key={a.id}
              className={`bg-card border rounded-2xl transition-colors ${
                isSelected ? "border-primary/60 shadow-[inset_0_0_0_1px_hsla(145,60%,45%,0.2)]" : "border-border"
              }`}
              style={isSelected ? { background: "linear-gradient(180deg, hsla(145,60%,45%,0.06), hsl(0 0% 4%))" } : undefined}
            >
              <div
                className="flex items-center gap-3 p-3 pl-3 pr-2 cursor-pointer touch-manipulation select-none"
                onClick={() => setExpandedId(isExpanded ? null : a.id)}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCompare(a.id); }}
                  aria-label={isSelected ? "Deselect for compare" : "Select for compare"}
                  className={`relative w-6 h-6 rounded-md border-2 flex items-center justify-center text-xs font-extrabold flex-none transition-colors touch-manipulation before:absolute before:-inset-2 before:content-[''] ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-muted-foreground/45"
                  }`}
                >
                  {isSelected && "✓"}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <TrailBadge trailId={tid} />
                    <span className="font-mono-display font-bold text-lg tabular-nums">
                      {formatDuration(a.totalTime!)}
                    </span>
                    {isBest && (
                      <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
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
                    <span className="opacity-60">·</span>
                    <span>{a.splits.length} markers</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 ml-auto" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 ml-auto" />
                    )}
                  </div>
                </div>
                <div className="relative flex-none" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === a.id ? null : a.id); }}
                    aria-label="More options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpenId === a.id}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors touch-manipulation ${
                      menuOpenId === a.id
                        ? "bg-muted border border-border text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <MoreVertical className="w-[18px] h-[18px]" />
                  </button>
                  {menuOpenId === a.id && (
                    <div
                      role="menu"
                      className="absolute top-10 right-0 z-30 min-w-[180px] rounded-xl border border-border bg-popover p-1.5 shadow-[0_12px_30px_rgba(0,0,0,0.6)]"
                    >
                      <button
                        role="menuitem"
                        disabled={!a.gpsTrack || a.gpsTrack.length === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          exportGpsTracksAsCsv([a]);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-foreground hover:bg-muted text-left disabled:opacity-40 disabled:hover:bg-transparent"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        Export GPS track
                      </button>
                      <button
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          if (window.confirm("Delete this hike? This cannot be undone.")) {
                            handleDelete(a.id);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-destructive hover:bg-muted text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete hike
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && a.splits.length > 0 && (
                <div className="px-4 pb-4 border-t border-border">
                  <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 pt-3 pb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span />
                    <span className="text-right">This</span>
                    <span className="text-right">Best</span>
                    <span className="text-right">Avg</span>
                  </div>
                  <div className="space-y-0.5">
                    <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 items-center py-1 text-xs">
                      <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-none bg-primary/20 text-primary">S</span>
                      <span className="col-span-3 text-muted-foreground italic text-[10px]">Start</span>
                    </div>
                    {(() => {
                      type Row =
                        | { kind: "split"; at: number; split: typeof a.splits[number]; index: number }
                        | { kind: "tag"; at: number; tag: NonNullable<typeof a.tags>[number] };
                      const rows: Row[] = a.splits.map((s, i) => ({ kind: "split", at: s.timestamp, split: s, index: i }));
                      for (const t of a.tags ?? []) rows.push({ kind: "tag", at: t.timestamp, tag: t });
                      rows.sort((x, y) => x.at - y.at);
                      return rows.map((row) => {
                        if (row.kind === "tag") {
                          return (
                            <div
                              key={`tag-${row.tag.id}`}
                              className="grid grid-cols-[1.5rem_1fr] gap-x-2 items-center py-1 text-xs"
                            >
                              <span className="w-5 h-5 rounded-full flex items-center justify-center flex-none bg-accent/20 text-accent">
                                <TagIcon className="w-3 h-3" />
                              </span>
                              <span className="text-muted-foreground text-[11px]">
                                <span className="text-foreground">{row.tag.text}</span>
                                <span className="ml-2 font-mono-display text-[10px] text-muted-foreground/70">
                                  {formatDuration(row.tag.elapsed)}
                                </span>
                              </span>
                            </div>
                          );
                        }
                        const s = row.split;
                        const i = row.index;
                        const prevSplit = a.splits[i - 1];
                        const seg = prevSplit ? s.elapsed - prevSplit.elapsed : s.elapsed;
                        const stats = !s.skipped ? markerStats.get(key(tid, s.marker)) : undefined;
                        const avg = stats ? Math.round(stats.totalMs / stats.count) : undefined;
                        return (
                          <div
                            key={`split-${s.marker}`}
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
                      });
                    })()}
                    {a.splits.length > 0 && !a.splits[a.splits.length - 1].skipped && (() => {
                      const lastSplit = a.splits[a.splits.length - 1];
                      const finishSeg = a.totalTime! - lastSplit.elapsed;
                      const stats = markerStats.get(key(tid, trail.finishMarker));
                      const avg = stats ? Math.round(stats.totalMs / stats.count) : undefined;
                      return (
                        <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr] gap-x-2 items-center py-1 text-xs">
                          <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-none bg-primary/20 text-primary">F</span>
                          <span className="font-mono-display text-right">{formatDuration(finishSeg)}</span>
                          <span className="font-mono-display text-right text-muted-foreground">
                            {stats ? formatDuration(stats.best) : "—"}
                          </span>
                          <span className="font-mono-display text-right text-muted-foreground">
                            {avg !== undefined ? formatDuration(avg) : "—"}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                  <HikeReport attempt={a} trail={trail} attempts={completed} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Slide-up compare bar — fixed near bottom when ≥2 selected */}
      {comparing.length >= 2 && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+72px)] left-0 right-0 z-20 px-4 pointer-events-none">
          <div className="mx-auto max-w-md pointer-events-auto">
            {compareMixed ? (
              <div className="compare-bar rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ background: "linear-gradient(135deg, hsl(0 60% 38%), hsl(0 60% 28%))" }}>
                <span className="w-7 h-7 rounded-full bg-black/25 flex items-center justify-center font-extrabold text-sm text-black">
                  {comparing.length}
                </span>
                <span className="flex-1 font-bold text-sm text-black">
                  Pick hikes from one trail to compare
                </span>
              </div>
            ) : (
              <button
                onClick={() => setShowComparison(true)}
                className="compare-bar w-full rounded-2xl px-4 py-3.5 flex items-center gap-3 text-black active:scale-[0.98] transition-transform"
              >
                <span className="w-7 h-7 rounded-full bg-black/25 flex items-center justify-center font-extrabold text-sm">
                  {comparing.length}
                </span>
                <span className="flex-1 text-left font-bold text-sm">
                  Compare hikes
                </span>
                <ArrowRight className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrailBadge({ trailId }: { trailId: TrailId }) {
  const t = TRAILS[trailId];
  const cls =
    trailId === "grind"
      ? "bg-amber-500/15 text-amber-500 border-amber-500/40"
      : "bg-emerald-500/15 text-emerald-500 border-emerald-500/40";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border ${cls}`}>
      {t.name}
    </span>
  );
}
