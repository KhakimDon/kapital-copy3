import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/App";
import "@/index.css";
import { initI18n } from "@/shared/i18n";

// Load the active locale before first paint (one dynamic import), then render.
// `.finally` so a locale-load failure still boots the app (keys fall back).
initI18n().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
});
