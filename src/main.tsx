import { createRoot } from "react-dom/client";
import App from "./App.tsx";

// Self-hosted fonts (replace runtime fetch from fonts.googleapis.com)
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";

import "./index.css";

if (navigator.storage?.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById("root")!).render(<App />);
