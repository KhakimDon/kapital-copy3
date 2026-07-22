// Derive a tab's label + icon from its current path, reusing the nav tree so
// tab titles stay in sync with the menu (and localise via i18n labelKeys).
import { NAV_TOP, ADMIN_ITEMS } from "./nav-config";

export type TabMeta = { label: string; labelKey?: string; icon: string };

type Entry = { to: string; label: string; labelKey?: string; icon: string };

// Flatten the nav tree into a {to → meta} list, longest-prefix wins.
const ENTRIES: Entry[] = (() => {
  const out: Entry[] = [
    { to: "/", label: "Asosiy", labelKey: "nav.home", icon: "Home" },
    // Profile-dropdown destinations — they live outside the nav tree, so the
    // resolver would otherwise fall back to the raw path as the tab title.
    { to: "/mcp", label: "MCP", labelKey: "mcp.menu", icon: "Plug" },
    { to: "/guide", label: "Qo'llanma", labelKey: "guide.title", icon: "BookOpen" },
    { to: "/me", label: "Mening profilim", labelKey: "me.title", icon: "UserRound" },
  ];
  for (const top of NAV_TOP) {
    if (top.to && top.to !== "#") {
      out.push({ to: top.to, label: top.label, labelKey: top.labelKey, icon: top.icon });
    }
    for (const col of top.columns ?? []) {
      for (const leaf of col.items) {
        out.push({ to: leaf.to, label: leaf.title, labelKey: leaf.labelKey, icon: leaf.icon });
      }
    }
  }
  for (const leaf of ADMIN_ITEMS) {
    out.push({ to: leaf.to, label: leaf.title, labelKey: leaf.labelKey, icon: leaf.icon });
  }
  return out;
})();

export function resolveTab(path: string): TabMeta {
  const clean = path.split("?")[0];
  let best: Entry | null = null;
  for (const e of ENTRIES) {
    if (e.to === "/" ? clean === "/" : clean === e.to || clean.startsWith(e.to + "/")) {
      if (!best || e.to.length > best.to.length) best = e;
    }
  }
  if (best) return { label: best.label, labelKey: best.labelKey, icon: best.icon };
  return { label: clean, icon: "File" };
}
