import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MobileApp } from "./app";
import "@/index.css";
import { initI18n } from "@/shared/i18n";

// Shared components (user menu) check this to flip the shell-switch item.
(window as { __AIBA_MOBILE__?: boolean }).__AIBA_MOBILE__ = true;

// Mobile entry (m.html) — same boot as desktop: active locale first, then render.
initI18n().finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <MobileApp />
    </StrictMode>
  );
});
