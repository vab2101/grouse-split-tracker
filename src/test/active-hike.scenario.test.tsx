/**
 * ActiveHike scenario integration test.
 *
 * Mounts <ActiveHike/>, monkey-patches navigator.geolocation via scenario-player
 * to emit a pre-recorded sequence of GPS fixes, fast-forwards vi.useFakeTimers,
 * and asserts the auto-tracker logged the expected markers — all in milliseconds.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ActiveHike from "@/components/ActiveHike";
import { BCMC_TRAIL } from "@/lib/trails";
import { installScenario, uninstallScenario } from "@/lib/scenario-player";
import { loadActiveHike } from "@/lib/hike-store";
import { happyPathBcmc } from "./fixtures/scenarios";

const TICK_MS = 100;

/** Step the fake clock forward in TICK_MS chunks so each scenario fix is
 *  observed by React separately (a single coarse advance would coalesce
 *  setPosition calls and the auto-tracker would miss intermediate fixes). */
function advanceInChunks(totalMs: number) {
  const steps = Math.ceil(totalMs / TICK_MS);
  for (let i = 0; i < steps; i++) {
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
  }
}

describe("ActiveHike — happy-path BCMC scenario", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ now: new Date("2026-05-03T08:00:00Z") });
  });

  afterEach(() => {
    uninstallScenario();
    vi.useRealTimers();
  });

  it("auto-logs all 7 markers via the auto-tracker", () => {
    installScenario(happyPathBcmc.fixes, { tickMs: TICK_MS });

    render(<ActiveHike onFinish={() => {}} trail={BCMC_TRAIL} />);

    fireEvent.click(screen.getByText("In Parking Lot"));
    fireEvent.click(screen.getByText("START"));

    const lastTMs = happyPathBcmc.fixes[happyPathBcmc.fixes.length - 1].tMs;
    advanceInChunks(lastTMs + 2_000);

    const active = loadActiveHike();
    expect(active).not.toBeNull();
    const splits = active!.splits;

    // Auto-tracker should have committed splits for markers 1..7 in order.
    const autoMarkers = splits.filter((s) => !s.skipped).map((s) => s.marker);
    for (const m of happyPathBcmc.expected!.markersHit!) {
      expect(autoMarkers).toContain(m);
    }
    // No skips expected on the happy path.
    expect(splits.filter((s) => s.skipped)).toHaveLength(0);
  });
});
