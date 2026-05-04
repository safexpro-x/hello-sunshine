import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { loadBrand } from "@/lib/branding";

// Apply white-label branding (logo, colors, favicon, title) before render.
// Failures fall back to defaults silently.
loadBrand().finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
