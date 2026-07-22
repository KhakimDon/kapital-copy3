import { useEffect } from "react";
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { useTabs, useDashActive } from "@/shared/store/tabs";
import { navMap } from "@/shared/store/tab-nav";
import { TabRoutes } from "./tab-routes";
import { ErrorBoundary } from "@/components/ui/error-boundary";

/**
 * Renders every open tab simultaneously, each in its own MemoryRouter, and
 * shows only the active one (`hidden` for the rest). Because inactive tabs stay
 * mounted, their component state, scroll position and in-flight forms survive
 * switching — the "full multi-window" behaviour.
 *
 * URL ↔ history bridge: each tab's MemoryRouter is isolated (React Router v7
 * forbids nesting routers), so the browser address bar + Back/Forward are wired
 * manually. The ACTIVE tab's path is mirrored into `window.history` (each entry
 * tagged with its tab id), and a single popstate listener routes Back/Forward
 * back into the right tab's router — so Back walks the in-app history instead of
 * leaving the SPA.
 */


// Public / auth paths that must NOT be preserved in history once we're inside
// the authenticated shell — so Back from the first in-app page leaves the app
// (normal web behaviour) instead of landing on a dead /login under auth.
function isBootPath(p: string): boolean {
  return p === "/login" || p.startsWith("/s/");
}

export function TabsHost() {
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);

  // Browser Back / Forward → restore the tab + route encoded in history.state
  // rather than navigating the browser out of the single-page app.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = (e: PopStateEvent) => {
      const target = window.location.pathname + window.location.search;
      const tabId = (e.state as { aibaTab?: string } | null)?.aibaTab;
      const st = useTabs.getState();
      if (tabId && st.tabs.some((t) => t.id === tabId)) {
        if (st.activeId !== tabId) st.setActive(tabId);
        navMap.get(tabId)?.(target);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // The dashboard is a glass surface — when it's active the content shell goes
  // transparent so the frosted wallpaper (painted by desktop-shell) shows through.
  const dashActive = useDashActive();

  return (
    <div className={cn("relative flex-1 overflow-hidden transition-colors duration-500", dashActive ? "bg-transparent" : "bg-background")}>
      {tabs.map((t) => (
        <div
          key={t.id}
          className={cn(
            "absolute inset-0 overflow-auto",
            // `display:none` also drops inactive tabs from tab order + a11y tree.
            t.id === activeId ? "block" : "hidden",
          )}
        >
          <MemoryRouter initialEntries={[t.path]}>
            <TabHistoryBridge id={t.id} />
            <div className="min-h-full p-8">
              {/* A crashing page must never blank the whole shell. */}
              <ErrorBoundary label={t.path}>
                <TabRoutes />
              </ErrorBoundary>
            </div>
          </MemoryRouter>
        </div>
      ))}
    </div>
  );
}

// Per-tab bridge: (1) mirrors the tab's live location into the tabs store (for
// labels + persistence), (2) registers the tab's `navigate` for the global
// Back/Forward handler, and (3) for the ACTIVE tab, mirrors its path into the
// browser address bar + history so the URL reflects where you are and Back works.
function TabHistoryBridge({ id }: { id: string }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType(); // PUSH | REPLACE | POP
  const setPath = useTabs((s) => s.setPath);
  const activeId = useTabs((s) => s.activeId);
  const isActive = id === activeId;
  const path = loc.pathname + loc.search;

  // (1) keep the tabs store in sync (labels + persistence)
  useEffect(() => {
    setPath(id, path);
  }, [id, path, setPath]);

  // (2) expose this tab's navigate to the global popstate handler
  useEffect(() => {
    navMap.set(id, (to) => navigate(to));
    return () => {
      navMap.delete(id);
    };
  }, [id, navigate]);

  // (3) ACTIVE tab → browser history (push new entries so Back works; replace
  // only when leaving a boot/auth entry so we don't strand /login under auth).
  useEffect(() => {
    if (!isActive || typeof window === "undefined") return;
    const cur = window.location.pathname + window.location.search;
    const tagged = (window.history.state as { aibaTab?: string } | null)?.aibaTab;
    if (cur === path && tagged === id) return; // already aligned (e.g. via Back)
    const state = { ...(window.history.state || {}), aibaTab: id };
    // REPLACE in-tab navigations (filter/search/pagination changes via
    // useUrlState) update the URL in place — no new Back entry. PUSH (page +
    // detail navigations) add an entry. POP never reaches here (cur === path).
    if (cur === path || isBootPath(cur) || navType === "REPLACE") {
      window.history.replaceState(state, "", path);
    } else {
      window.history.pushState(state, "", path);
    }
  }, [isActive, id, path, navType]);

  return null;
}
