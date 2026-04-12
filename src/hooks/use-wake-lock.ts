import { useEffect, useRef, useCallback } from "react";

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      sentinelRef.current = await navigator.wakeLock.request("screen");
      sentinelRef.current.addEventListener("release", () => {
        sentinelRef.current = null;
      });
    } catch {
      // Best-effort — fails silently if document is hidden or API unavailable
    }
  }, []);

  const release = useCallback(() => {
    sentinelRef.current?.release();
    sentinelRef.current = null;
  }, []);

  useEffect(() => {
    if (active) {
      acquire();
    } else {
      release();
    }
    return release;
  }, [active, acquire, release]);

  // Wake lock is automatically released when the page is hidden (manual lock,
  // app switch). Re-acquire it when the user returns so the screen stays on
  // for the remainder of the hike.
  useEffect(() => {
    if (!active) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") acquire();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [active, acquire]);
}
