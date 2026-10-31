// Cloudflare Worker entry. Static assets are served by the [assets] binding;
// this script only runs for /api/* (see run_worker_first in wrangler.toml).

interface AnalyticsEngineDataset {
  writeDataPoint(event: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
  EVENTS: AnalyticsEngineDataset;
}

// Only accept known event names so the dataset can't be filled with junk.
const ALLOWED_EVENTS = new Set(["hike-start"]);

const clip = (v: unknown, max = 64) => (typeof v === "string" ? v.slice(0, max) : "");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/event") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
      }

      let body: Record<string, unknown>;
      try {
        body = await request.json();
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      const name = clip(body.name);
      if (!ALLOWED_EVENTS.has(name)) {
        return new Response("Unknown event", { status: 400 });
      }

      // request.cf is only present on Cloudflare's edge.
      const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};

      // No IPs, no user agents, no identifiers — aggregate counts only.
      // blob1 = event, blob2 = trail, blob3 = app version, blob4 = country, blob5 = hostname
      env.EVENTS.writeDataPoint({
        indexes: [name],
        blobs: [name, clip(body.trail), clip(body.version, 32), clip(cf.country, 8), url.hostname],
        doubles: [1],
      });

      return new Response(null, { status: 204 });
    }

    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }

    return env.ASSETS.fetch(request);
  },
};
