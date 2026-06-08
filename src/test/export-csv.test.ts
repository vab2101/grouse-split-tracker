/**
 * exportHikesAsCsv tests
 *
 * Verifies the Excel-friendly hike export: separate lat/lng/alt columns, local
 * date-time formatting, per-marker cumulative + segment trail distance (with
 * forgotten markers accumulating into the next captured marker), and full
 * chronological ordering (oldest hike first).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { exportHikesAsCsv, type HikeAttempt, type Split } from "@/lib/hike-store";
import { getTrail } from "@/lib/trails";

// Capture the CSV text handed to Blob instead of actually downloading it.
let captured = "";
beforeEach(() => {
  captured = "";
  vi.stubGlobal(
    "Blob",
    class {
      constructor(parts: string[]) {
        captured = parts.join("");
      }
    },
  );
  vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
  const link = { href: "", download: "", click: () => {} } as unknown as HTMLAnchorElement;
  vi.spyOn(document, "createElement").mockReturnValue(link);
  vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
  vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);
});

function rows(): string[][] {
  return captured.split("\n").map((line) => line.split(","));
}

const grind = getTrail("grind");
const m = (n: number) => grind.markersByNum.get(n)!;

function split(marker: number, ts: number, extra: Partial<Split> = {}): Split {
  return {
    marker,
    timestamp: ts,
    elapsed: ts,
    coords: { latitude: 49.1 + marker / 1000, longitude: -123.1, altitude: 300, accuracy: 5 },
    mode: "auto",
    ...extra,
  };
}

describe("exportHikesAsCsv", () => {
  it("splits GPS into lat/lng/alt columns and formats time as local Excel date-time", () => {
    const start = new Date(2026, 4, 24, 8, 0, 0).getTime(); // local 2026-05-24 08:00:00
    const attempt: HikeAttempt = {
      id: "h1",
      date: new Date(start).toISOString(),
      startTime: start,
      endTime: start + 60_000,
      splits: [split(1, start + 10_000)],
      elevationData: [],
      completed: true,
      trailId: "grind",
      startCoords: { latitude: 49.36, longitude: -123.08, altitude: 290, accuracy: 4 },
    };
    exportHikesAsCsv([attempt]);
    const r = rows();
    const header = r[0];
    expect(header).toContain("Latitude");
    expect(header).toContain("Longitude");
    expect(header).toContain("Altitude (m)");
    expect(header).toContain("Cumulative Trail Distance (m)");
    expect(header).toContain("Segment Distance (m)");
    // Start row local time, no T / Z, native Excel format.
    const startRow = r[1];
    expect(startRow[2]).toBe("2026-05-24 08:00:00");
    expect(startRow[6]).toBe("49.3600000"); // latitude its own column
    expect(startRow[7]).toBe("-123.0800000");
  });

  it("accumulates segment distance across a forgotten marker", () => {
    const start = new Date(2026, 0, 1, 6, 0, 0).getTime();
    const attempt: HikeAttempt = {
      id: "h1",
      date: new Date(start).toISOString(),
      startTime: start,
      splits: [
        split(1, start + 1000),
        split(2, start + 2000, { skipped: true }), // forgotten — no segment
        split(3, start + 3000),
      ],
      elevationData: [],
      completed: true,
      trailId: "grind",
    };
    exportHikesAsCsv([attempt]);
    const r = rows();
    // header, start(0), m1, m2(skip), m3
    const segIdx = r[0].indexOf("Segment Distance (m)");
    const markerIdx = r[0].indexOf("Trail Marker Number");
    const find = (mk: string) => r.find((row) => row[markerIdx] === mk)!;
    const m2row = find("2");
    const m3row = find("3");
    expect(m2row[segIdx]).toBe(""); // forgotten marker: blank segment
    // marker 3 segment spans marker 2's gap: dist(3) - dist(1)
    const expected = (m(3).distanceM - m(1).distanceM).toFixed(1);
    expect(m3row[segIdx]).toBe(expected);
  });

  it("orders hikes oldest-first regardless of input order", () => {
    const older = new Date(2026, 0, 1, 6, 0, 0).getTime();
    const newer = new Date(2026, 2, 1, 6, 0, 0).getTime();
    const mk = (id: string, t: number): HikeAttempt => ({
      id,
      date: new Date(t).toISOString(),
      startTime: t,
      splits: [split(1, t + 1000)],
      elevationData: [],
      completed: true,
      trailId: "grind",
    });
    exportHikesAsCsv([mk("new", newer), mk("old", older)]);
    const r = rows();
    expect(r[1][0]).toBe("old"); // first data row is the older hike
  });
});
