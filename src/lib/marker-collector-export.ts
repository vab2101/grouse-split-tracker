import { MarkerTag } from "./marker-collector-store";
import { TRAIL_ROUTE } from "./trail-gpx";

export function exportMarkersAsCSV(tags: MarkerTag[]): string {
  const lines = [
    "marker,latitude,longitude,elevation,accuracy_m,timestamp,iso_time",
  ];

  tags.forEach((tag) => {
    lines.push(
      `${tag.marker},${tag.lat.toFixed(7)},${tag.lng.toFixed(7)},${tag.elevation.toFixed(2)},${tag.accuracy.toFixed(1)},${tag.timestamp},${new Date(tag.timestamp).toISOString()}`
    );
  });

  return lines.join("\n");
}

export function exportTrailAsGPX(): string {
  const now = new Date().toISOString();

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="grind-collect" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Grouse Grind Trail</name>
    <time>${now}</time>
  </metadata>
  <trk>
    <name>Grouse Grind Trail</name>
    <trkseg>
`;

  TRAIL_ROUTE.forEach((point) => {
    gpx += `      <trkpt lat="${point.lat}" lon="${point.lng}">
        <ele>${point.ele}</ele>
      </trkpt>
\n`;
  });

  gpx += `    </trkseg>
  </trk>
</gpx>`;

  return gpx;
}

export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
