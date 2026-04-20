import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { execSync } from "child_process";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

function getCommitHash() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// https://vitejs.dev/config/
export default defineConfig(() => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_HASH__: JSON.stringify(getCommitHash()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
