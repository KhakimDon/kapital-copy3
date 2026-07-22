import { lazy, Suspense } from "react";
import { Providers } from "@/app/providers";
import { AuthRouter } from "@/app/router";
import { useAuth } from "@/shared/store/auth";
import { LightboxHost } from "@/components/ui/lightbox";

/** Mobile app root — same auth gate as desktop (login + public share links are
 *  the shared AuthRouter), but the authenticated chrome is the bottom-nav
 *  MobileShell instead of the tab shell. */
const MobileShell = lazy(() => import("./shell").then((m) => ({ default: m.MobileShell })));

export function MobileApp() {
  const token = useAuth((s) => s.token);
  const isShare =
    typeof window !== "undefined" && window.location.pathname.startsWith("/s/");

  return (
    <Providers>
      {isShare || !token ? (
        <AuthRouter />
      ) : (
        <Suspense fallback={null}>
          <MobileShell />
        </Suspense>
      )}
      <LightboxHost />
    </Providers>
  );
}
