import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (navigator.storage?.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById("root")!).render(<App />);
