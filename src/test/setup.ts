import "@testing-library/jest-dom";

// The host node binary preloads a stub `localStorage` global without the
// Storage prototype methods (clear/getItem/setItem/removeItem). jsdom's own
// Storage gets shadowed, so install a working shim before any test code runs.
if (typeof localStorage === "undefined" || typeof (localStorage as { clear?: unknown }).clear !== "function") {
  const store = new Map<string, string>();
  const shim = {
    get length() { return store.size; },
    clear: () => { store.clear(); },
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: shim });
  Object.defineProperty(window, "localStorage", { configurable: true, value: shim });
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: ResizeObserverShim });
}

if (!("geolocation" in navigator)) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      watchPosition: () => 0,
      clearWatch: () => {},
      getCurrentPosition: () => {},
    },
  });
}

if (!("wakeLock" in navigator)) {
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => ({
        released: false,
        release: async () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    },
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
