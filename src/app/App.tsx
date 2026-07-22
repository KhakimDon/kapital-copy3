import { lazy, Suspense } from "react";
import { Providers } from "@/app/providers";
import { AuthRouter } from "@/app/router";
import { useAuth } from "@/shared/store/auth";
import { LightboxHost } from "@/components/ui/lightbox";

// The whole authenticated app (shell chrome + module registry) is code-split so
// the login screen never has to download it — a huge cut to the unauthenticated
// page weight.
const DesktopShell = lazy(() =>
  import("@/app/layout/desktop-shell").then((m) => ({ default: m.DesktopShell })),
);

export function App() {
  const token = useAuth((s) => s.token);
  // Public share links render unauthenticated, even for logged-in users.
  const isShare =
    typeof window !== "undefined" && window.location.pathname.startsWith("/s/");

  return (
    <Providers>
      {isShare || !token ? (
        <AuthRouter />
      ) : (
        <Suspense fallback={null}>
          <DesktopShell />
        </Suspense>
      )}
      {/* Full-screen image viewer for content images (wiki, tasks, guide). */}
      <LightboxHost />
    </Providers>
  );
}
