import type { PacePlan } from "@/lib/pace-plan";
import { formatDuration } from "@/lib/hike-store";
import { Target } from "lucide-react";

interface PacePlanCardProps {
  plan: PacePlan;
}

/**
 * "Plan of attack" card on the pre-start screen: target finish time, quarter
 * checkpoint times (with the physical marker to watch for), and pacing advice
 * derived from the hiker's own history.
 */
export default function PacePlanCard({ plan }: PacePlanCardProps) {
  return (
    <div className="w-full max-w-xs bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/25 text-primary">
          <Target className="w-4 h-4" />
        </span>
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground leading-none">Today's plan</p>
          <p className="text-lg font-mono-display font-bold text-primary leading-tight tabular-nums">
            {formatDuration(plan.targetTotalMs)}
            <span className="ml-2 text-[10px] font-sans font-semibold text-muted-foreground uppercase tracking-wide">
              beat {plan.basis === "pb" ? "PB" : "recent avg"}
            </span>
          </p>
        </div>
      </div>

      {/* Quarter checkpoints */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {plan.checkpoints.map((c) => (
          <div key={c.label} className="bg-muted/50 rounded-lg px-1 py-1.5 text-center">
            <p className="text-[9px] text-muted-foreground leading-none mb-0.5">
              {c.label}
              {c.marker !== null && c.label !== "Finish" ? ` · m${c.marker}` : ""}
            </p>
            <p className="text-xs font-mono-display font-bold tabular-nums">{formatDuration(c.targetMs)}</p>
          </div>
        ))}
      </div>

      {plan.advice.length > 0 && (
        <ul className="space-y-1">
          {plan.advice.map((line, i) => (
            <li key={i} className="text-[11px] text-muted-foreground leading-snug flex gap-1.5">
              <span className="text-primary flex-none">▸</span>
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
