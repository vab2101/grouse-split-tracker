// Fire-and-forget usage events, recorded in Cloudflare Workers Analytics Engine
// by worker/index.ts. No identifiers are sent — just the event name and context.

export type AnalyticsEvent = "hike-start";

export function trackEvent(name: AnalyticsEvent, props: { trail?: string } = {}): void {
  if (import.meta.env.DEV) return;
  const payload = JSON.stringify({ name, version: __APP_VERSION__, ...props });
  try {
    const blob = new Blob([payload], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/event", blob)) return;
    void fetch("/api/event", {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics must never break the app (e.g. offline on the trail).
  }
}
