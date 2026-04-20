/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;
declare const __BUILD_DATE__: string;

interface Window {
  goatcounter?: {
    count: (opts: { path: string; title?: string; event?: boolean }) => void;
  };
}
