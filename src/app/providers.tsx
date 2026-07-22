import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * App-wide providers. NOTE: there is intentionally no Router here — the auth /
 * public area mounts its own BrowserRouter (app/router.tsx) while the
 * authenticated DesktopShell mounts a separate MemoryRouter per tab
 * (tabs-host.tsx). React Router v7 forbids nested routers, so the single global
 * router was removed in favour of that split.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
