import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { Plus, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTabs, useDashActive } from "@/shared/store/tabs";
import { resolveTab } from "./tab-title";

function icon(name: string) {
  return (
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ??
    Icons.Square
  );
}

const CLOSE_ANIM_MS = 200;

/**
 * Chrome-style tab strip. Tabs can be dragged to reorder; newly-opened tabs
 * slide in from the right and closed tabs slide out to the left (the close is
 * deferred until the exit animation finishes). The active tab is filled with
 * the content colour and its bottom edge sits flush against the content box.
 */
export function TabStrip() {
  const { t } = useTranslation();
  const tabs = useTabs((s) => s.tabs);
  const titles = useTabs((s) => s.titles);
  const activeId = useTabs((s) => s.activeId);
  const setActive = useTabs((s) => s.setActive);
  const close = useTabs((s) => s.close);
  const reorder = useTabs((s) => s.reorder);
  const openNew = useTabs((s) => s.openNew);

  const [dragId, setDragId] = useState<string | null>(null);
  const [closing, setClosing] = useState<Set<string>>(new Set());
  const elRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // The dashboard's active tab is a glass chip (not the solid content colour) so
  // it reads as part of the transparent dashboard surface over the wallpaper.
  const dashActive = useDashActive();

  // Only tabs opened *after* first paint slide in — the ones restored on load
  // are already "seen" so the strip doesn't animate on every startup.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current === null) seen.current = new Set(tabs.map((tb) => tb.id));
  useEffect(() => {
    tabs.forEach((tb) => seen.current?.add(tb.id));
  });

  const handleClose = (id: string) => {
    if (closing.has(id)) return;
    // Smoothly collapse the tab from its OWN measured width to 0 (animating a
    // fixed keyframe from max-width:210 caused a stutter — a pause while the cap
    // dropped to the real width, then a snap). Pin the current width, then on the
    // next frame transition it to 0; neighbours slide over cleanly.
    const el = elRefs.current.get(id);
    if (el) {
      const w = el.offsetWidth;
      el.style.width = `${w}px`;
      el.style.maxWidth = `${w}px`;
      el.style.flex = "0 0 auto";
      void el.offsetWidth; // force reflow so the start width is committed
      requestAnimationFrame(() => {
        el.style.transition = "width 200ms cubic-bezier(0.4,0,1,1), max-width 200ms cubic-bezier(0.4,0,1,1), opacity 170ms ease, padding 200ms cubic-bezier(0.4,0,1,1)";
        el.style.width = "0px";
        el.style.maxWidth = "0px";
        el.style.paddingLeft = "0px";
        el.style.paddingRight = "0px";
        el.style.opacity = "0";
      });
    }
    setClosing((s) => new Set(s).add(id));
    window.setTimeout(() => {
      close(id);
      setClosing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, CLOSE_ANIM_MS);
  };

  return (
    <div className="flex min-w-0 flex-1 items-end gap-0 overflow-x-auto pl-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab, i) => {
        const meta = resolveTab(tab.path);
        const TabIcon = icon(meta.icon);
        const active = tab.id === activeId;
        const prevActive = i > 0 && tabs[i - 1].id === activeId;
        const label = titles[tab.path] || (meta.labelKey ? t(meta.labelKey, { defaultValue: meta.label }) : meta.label);
        const isNew = !seen.current!.has(tab.id);
        const isClosing = closing.has(tab.id);
        return (
          <div
            key={tab.id}
            ref={(el) => {
              if (el) elRefs.current.set(tab.id, el);
              else elRefs.current.delete(tab.id);
            }}
            role="tab"
            aria-selected={active}
            draggable
            onDragStart={(e) => { setDragId(tab.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragId && dragId !== tab.id) reorder(dragId, tab.id);
            }}
            onDrop={(e) => e.preventDefault()}
            onClick={() => setActive(tab.id)}
            onAuxClick={(e) => {
              if (e.button === 1) handleClose(tab.id); // middle-click closes, like a browser
            }}
            className={cn(
              "group relative flex h-9 min-w-[130px] max-w-[210px] cursor-pointer select-none items-center gap-2 rounded-t-[10px] px-3 text-[13px]",
              active
                ? dashActive
                  ? "tab-active tab-active-glass z-20 bg-white/15 text-white backdrop-blur-md"
                  : "tab-active z-20 bg-background text-foreground"
                : "text-white/60 hover:bg-white/10 hover:text-white",
              dragId === tab.id && "opacity-40",
              // Chrome-like: a closing tab collapses its width to 0 (so the
              // neighbours slide over smoothly instead of snapping), a new tab
              // pops in. `!min-w-0` lets the width actually reach 0.
              // The closing collapse is driven imperatively (measured width →
              // 0) in handleClose; here we just freeze interaction + clip.
              isClosing
                ? "pointer-events-none z-0 overflow-hidden !min-w-0"
                : isNew && "animate-[tabIn_240ms_cubic-bezier(0.16,1,0.3,1)]",
            )}
          >
            {/* Separator before this tab — hidden beside the active tab and on hover. */}
            {i > 0 && !active && !prevActive && (
              <span className="absolute -left-px top-1/2 h-4 w-px -translate-y-1/2 bg-white/15 transition-opacity group-hover:opacity-0" />
            )}
            <TabIcon className={cn("size-4 shrink-0", active && (dashActive ? "text-white" : "text-primary"))} />
            <span className="flex-1 truncate">{label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClose(tab.id);
              }}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
                active
                  ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                  : "text-white/60 hover:bg-white/20 hover:text-white",
              )}
              aria-label="close tab"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => openNew()}
        className="mb-1 ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        aria-label="new tab"
        title={t("tabs.new", { defaultValue: "Yangi oyna" })}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
