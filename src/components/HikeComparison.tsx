import { HikeAttempt, formatDuration } from "@/lib/hike-store";

interface HikeComparisonProps {
  attempts: HikeAttempt[];
}

const COLORS = ["text-primary", "text-accent", "text-destructive"];

export default function HikeComparison({ attempts }: HikeComparisonProps) {
  // Get all markers across attempts
  const allMarkers = new Set<number>();
  attempts.forEach((a) => a.splits.forEach((s) => allMarkers.add(s.marker)));
  const markers = Array.from(allMarkers).sort((a, b) => a - b);

  return (
    <div className="px-6 py-4">
      <h2 className="text-lg font-bold mb-4">Split Comparison</h2>

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {attempts.map((a, i) => (
          <div key={a.id} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${COLORS[i]} bg-current`} />
            <span className="text-xs text-muted-foreground">
              {new Date(a.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
              {" · "}
              {formatDuration(a.totalTime!)}
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[60px_1fr] bg-muted/50 px-4 py-2 text-xs uppercase tracking-widest text-muted-foreground">
          <span>Marker</span>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${attempts.length}, 1fr)` }}>
            {attempts.map((a, i) => (
              <span key={a.id} className={`text-right ${COLORS[i]}`}>
                {new Date(a.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        {markers.map((marker) => {
          const splits = attempts.map((a) => a.splits.find((s) => s.marker === marker));
          const times = splits.map((s) => s?.elapsed).filter(Boolean) as number[];
          const bestTime = Math.min(...times);

          return (
            <div
              key={marker}
              className="grid grid-cols-[60px_1fr] px-4 py-2.5 border-t border-border text-sm"
            >
              <span className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                {marker}
              </span>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${attempts.length}, 1fr)` }}
              >
                {splits.map((s, i) => (
                  <span
                    key={i}
                    className={`text-right font-mono-display text-xs ${
                      s?.elapsed === bestTime ? "text-primary font-bold" : "text-foreground"
                    }`}
                  >
                    {s ? formatDuration(s.elapsed) : "—"}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {/* Totals */}
        <div className="grid grid-cols-[60px_1fr] px-4 py-3 border-t-2 border-primary/30 bg-muted/30 font-bold">
          <span className="text-xs text-muted-foreground">Total</span>
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${attempts.length}, 1fr)` }}
          >
            {attempts.map((a, i) => {
              const isBest = a.totalTime === Math.min(...attempts.map((x) => x.totalTime!));
              return (
                <span
                  key={a.id}
                  className={`text-right font-mono-display text-sm ${
                    isBest ? "text-primary" : "text-foreground"
                  }`}
                >
                  {formatDuration(a.totalTime!)}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
