import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installPageProtection } from "./lib/security";

// Protection runs BEFORE the app boots. If the environment is a saved/local
// copy (or an unauthorised host), the document is replaced with a blocked
// page and React never mounts.
const allowedToBoot = installPageProtection();
const rootEl = document.getElementById("root");

if (allowedToBoot && rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
