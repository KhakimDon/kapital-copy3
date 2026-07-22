import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, FileText, Search } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Markdown } from "./md";

/** User guide — MD pages that live IN THE CODE and ship with every deploy.
 *
 *  ONE PAGE PER ACTION/TOPIC. A module adds pages by dropping files at
 *    src/modules/<module>/docs/pages/<NNN>-<slug>.<locale>.md
 *  (locales: uz | uz_Cyrl | ru | en; NNN orders the sidebar; the H1 is the
 *  page title) plus screenshots under src/modules/<module>/docs/img/.
 *  Pages cross-link with `[title](page:slug)` — rendered as in-guide
 *  navigation. Everything is bundled at build time (Vite glob; no DB) and
 *  rendered read-only in the wiki's Notion-like style. */

// ── bundled content ──────────────────────────────────────────────────────────
const PAGES = import.meta.glob("../*/docs/pages/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const IMAGES = import.meta.glob("../*/docs/img/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

type PageEntry = {
  module: string;
  order: number;
  slug: string;
  /** locale → markdown */
  locales: Record<string, string>;
};

function collect(): Record<string, PageEntry[]> {
  const map = new Map<string, PageEntry>();
  for (const [path, md] of Object.entries(PAGES)) {
    // "../tasks/docs/pages/040-assign.uz_Cyrl.md"
    const m = /\.\.\/([^/]+)\/docs\/pages\/(\d+)-([a-z0-9-]+)\.([A-Za-z_]+)\.md$/.exec(path);
    if (!m) continue;
    const key = `${m[1]}/${m[3]}`;
    const e = map.get(key) ?? { module: m[1], order: Number(m[2]), slug: m[3], locales: {} };
    e.locales[m[4]] = md;
    map.set(key, e);
  }
  const byModule: Record<string, PageEntry[]> = {};
  for (const e of map.values()) (byModule[e.module] ??= []).push(e);
  for (const list of Object.values(byModule)) list.sort((a, b) => a.order - b.order);
  return byModule;
}

/** Pick the best locale variant with uz→ru→en fallback. */
function pick(locales: Record<string, string>, lang: string): string {
  for (const l of [lang, "uz", "ru", "en"]) if (locales[l]) return locales[l];
  return Object.values(locales)[0] ?? "";
}

const titleOf = (md: string) => /^#\s+(.+)$/m.exec(md)?.[1]?.trim() ?? "";

const MODULE_META: Record<string, { icon: string; order: number }> = {
  tasks: { icon: "📋", order: 1 },
  mcp: { icon: "🤖", order: 2 },
  calendar: { icon: "📅", order: 3 },
  messenger: { icon: "💬", order: 4 },
};

export function GuidePage() {
  const { t, i18n } = useTranslation();
  const tr = (k: string, d: string) => t(k, { defaultValue: d });
  const lang = (i18n.language ?? "uz").replace("-", "_");

  const byModule = useMemo(collect, []);
  const modules = Object.keys(byModule).sort(
    (a, b) => (MODULE_META[a]?.order ?? 99) - (MODULE_META[b]?.order ?? 99),
  );
  const [active, setActive] = useState(modules[0] ?? "");
  const pages = byModule[active] ?? [];
  const [pageSlug, setPageSlug] = useState(pages[0]?.slug ?? "");
  // Sidebar affordances: page search + per-module collapse (wiki-style).
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (m: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });
  const query = q.trim().toLowerCase();
  const pageMatches = (p: PageEntry) =>
    !query || titleOf(pick(p.locales, lang)).toLowerCase().includes(query);

  const page = pages.find((p) => p.slug === pageSlug) ?? pages[0];
  const md = page ? pick(page.locales, lang) : "";
  const title = titleOf(md);

  const openModule = (m: string) => {
    setActive(m);
    setPageSlug(byModule[m]?.[0]?.slug ?? "");
  };
  const openPage = (slug: string) => {
    if (pages.some((p) => p.slug === slug)) {
      setPageSlug(slug);
    } else {
      // Cross-module link (e.g. tasks → mcp "connect"): find the module that
      // owns the slug and switch to it.
      const owner = Object.entries(byModule).find(([, ps]) => ps.some((p) => p.slug === slug));
      if (owner) {
        setActive(owner[0]);
        setPageSlug(slug);
      }
    }
    document.querySelector("[data-guide-scroll]")?.scrollTo({ top: 0 });
  };

  // Relative image paths in MD (img/foo.png) → bundled URLs of the active module.
  const resolveImg = (src: string) => {
    if (/^(https?:|data:)/.test(src)) return src;
    const clean = src.replace(/^\.\//, "");
    const hit = Object.entries(IMAGES).find(([p]) => p.includes(`/${active}/docs/${clean}`));
    return hit ? hit[1] : src;
  };

  return (
    <div className="-m-6 flex h-[calc(100vh-66px)] overflow-hidden">
      {/* Sidebar — wiki-style: modules → their guide pages */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/40">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          <BookOpen className="size-4 text-primary" />
          <span className="text-sm font-semibold">{tr("guide.title", "Qo'llanma")}</span>
        </div>
        {/* page search — wiki-style */}
        <div className="px-3 pb-1">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("guide.searchPh", "Qidirish…")}
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {modules.map((m) => {
            const visible = (byModule[m] ?? []).filter(pageMatches);
            if (query && visible.length === 0) return null; // no hits → hide module
            const expanded = query ? true : !collapsed.has(m);
            return (
              <div key={m} className="mt-2">
                <div
                  className={cn(
                    "flex w-full items-center gap-1 rounded-lg pr-2 text-sm font-medium transition-colors",
                    active === m ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  {/* collapse chevron — independent of selection */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleCollapsed(m); }}
                    className="rounded p-1 text-muted-foreground hover:bg-accent"
                    aria-label={expanded ? "Collapse" : "Expand"}
                  >
                    <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { openModule(m); setCollapsed((prev) => { const n = new Set(prev); n.delete(m); return n; }); }}
                    className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
                  >
                    <span>{MODULE_META[m]?.icon ?? "📄"}</span>
                    <span className="truncate">{tr(`guide.module.${m}`, m === "tasks" ? "Vazifalar (Tasks)" : m)}</span>
                  </button>
                </div>
                {expanded && (
                  <div className="mt-1 space-y-0.5 pl-5">
                    {visible.map((p) => (
                      <button
                        key={p.slug}
                        type="button"
                        onClick={() => { setActive(m); setPageSlug(p.slug); }}
                        className={cn(
                          "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors",
                          active === m && page?.slug === p.slug
                            ? "bg-accent font-medium text-foreground"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        )}
                      >
                        <FileText className="size-3 shrink-0" />
                        <span className="truncate">{titleOf(pick(p.locales, lang))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {modules.length === 0 && (
            <p className="px-3 pt-4 text-xs text-muted-foreground">{tr("guide.empty", "Qo'llanmalar hali qo'shilmagan.")}</p>
          )}
          {query && modules.every((m) => (byModule[m] ?? []).filter(pageMatches).length === 0) && (
            <p className="px-3 pt-4 text-xs text-muted-foreground">{tr("guide.noResults", "Hech narsa topilmadi.")}</p>
          )}
        </div>
      </aside>

      {/* Content — wiki reading surface */}
      <main data-guide-scroll className="min-w-0 flex-1 overflow-y-auto bg-background">
        <div className="sticky top-0 z-10 flex h-11 items-center gap-1 border-b border-border bg-background/90 px-4 text-sm backdrop-blur">
          <span className="text-muted-foreground">📖</span>
          <span className="font-medium">{title}</span>
        </div>
        <div className="mx-auto max-w-3xl px-8 pt-6">
          {md ? <Markdown md={md} resolveImg={resolveImg} onPageLink={openPage} /> : (
            <p className="pt-10 text-center text-muted-foreground">{tr("guide.empty", "Qo'llanmalar hali qo'shilmagan.")}</p>
          )}
        </div>
      </main>
    </div>
  );
}
