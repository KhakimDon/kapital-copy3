import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/modules/login/page";

// Public share links live OUTSIDE the authenticated shell.
const PublicSharePage = lazy(() =>
  import("@/modules/files/public-page").then((m) => ({ default: m.PublicSharePage })),
);

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="p-6 text-muted-foreground">Yuklanmoqda…</div>}>{children}</Suspense>;
}

/**
 * Unauthenticated / public router. The authenticated module routes are NOT here
 * — each open tab runs its own MemoryRouter inside DesktopShell (tab-routes.tsx)
 * because React Router v7 forbids nesting routers.
 */
export function AuthRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/s/:token" element={<Lazy><PublicSharePage /></Lazy>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
