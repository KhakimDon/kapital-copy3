import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AccessRole, Block, BlockType, Page, PageHistory, PageHistoryKind, PageViews, Space } from "./model";
import { uid, nowISO } from "./util";
import * as wikiApi from "../wiki-api";

// ─────────────────────────────────────────────────────────────────────────────
// Server-persisted Wiki store. The wiki DATA (spaces, pages, blocks) lives on the
// server (see ../wiki-api.ts) so it is shared across users/devices; `loadWiki`
// GETs it per company and every mutation stays synchronous + optimistic locally,
// then fire-and-forgets an idempotent UPSERT. Only the client-only view/history
// stats survive reload (localStorage) — they are not part of the server contract.
// ─────────────────────────────────────────────────────────────────────────────

export type Member = { id: string; name: string; avatar?: string | null };

type WikiState = {
  spaces: Space[];
  pages: Page[];
  blocks: Block[];
  members: Member[];
  history: PageHistory[];
  views: PageViews;
  currentUserId: string | null;

  // ── server sync bookkeeping ──
  currentCompanyId: number | null;
  loading: boolean;
  loadedCompanies: number[];

  // ── bootstrap ──
  ensureUser: (username: string) => string;
  loadWiki: (companyId: number) => Promise<void>;
  setMembers: (members: Member[]) => void;

  // presence / stats
  recordView: (pageId: string) => void;

  // spaces
  createSpace: (companyId: number | null, name: string, icon: string) => string;
  updateSpace: (id: string, patch: Partial<Space>) => void;
  deleteSpace: (id: string) => void;
  setSpaceAccess: (spaceId: string, memberId: string, role: AccessRole | null) => void;
  setSpaceEveryone: (spaceId: string, role: AccessRole | null) => void;

  // pages
  createPage: (spaceId: string, parentId: string | null, opts?: { title?: string; icon?: string }) => string;
  duplicatePage: (id: string) => string | null;
  updatePage: (id: string, patch: Partial<Page>) => void;
  deletePage: (id: string) => void;
  movePage: (id: string, parentId: string | null, index: number) => void;

  // blocks
  createBlock: (pageId: string, afterId: string | null, type?: BlockType, text?: string, parentBlockId?: string | null) => string;
  updateBlock: (id: string, patch: Partial<Block>) => void;
  deleteBlock: (id: string) => void;
  moveBlock: (id: string, toIndex: number) => void;
  toggleCollapse: (id: string) => void;
  indentBlock: (id: string) => void;
  outdentBlock: (id: string) => void;
};

/** Append a page-history entry, coalescing rapid consecutive "edited" by the same
 *  user (within 3 min) so typing doesn't spam the timeline. */
function pushHistory(history: PageHistory[], pageId: string, userId: string, kind: PageHistoryKind): PageHistory[] {
  if (kind === "edited") {
    const forPage = history.filter((h) => h.pageId === pageId);
    const last = forPage[forPage.length - 1];
    if (last && last.userId === userId && last.kind === "edited" && Date.now() - new Date(last.at).getTime() < 3 * 60_000) {
      return history.map((h) => (h.id === last.id ? { ...h, at: nowISO() } : h));
    }
  }
  return [...history, { id: uid(), pageId, userId, at: nowISO(), kind }];
}

const renumber = <T extends { order: number }>(arr: T[]): T[] => arr.map((x, i) => ({ ...x, order: i }));

/** All descendant page ids of `pageId` (inclusive). */
function subtreeIds(pages: Page[], pageId: string): Set<string> {
  const out = new Set<string>([pageId]);
  let added = true;
  while (added) {
    added = false;
    for (const p of pages) {
      if (p.parentId && out.has(p.parentId) && !out.has(p.id)) {
        out.add(p.id);
        added = true;
      }
    }
  }
  return out;
}

export const useWikiStore = create<WikiState>()(
  persist(
    (set, get) => {
      // ── server-sync helpers (fire-and-forget; the local `set` already ran) ──
      const err = (label: string) => (e: unknown) => console.error(`[wiki] ${label} failed`, e);

      const pushSpace = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const sp = get().spaces.find((x) => x.id === id);
        if (sp) wikiApi.putSpace(cid, sp).catch(err("putSpace"));
      };
      const pushPage = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const p = get().pages.find((x) => x.id === id);
        if (p) wikiApi.putPage(cid, p).catch(err("putPage"));
      };
      const pushPages = (ids: string[]) => ids.forEach(pushPage);
      const pushBlock = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const b = get().blocks.find((x) => x.id === id);
        if (b) wikiApi.putBlock(cid, b).catch(err("putBlock"));
      };
      // Reorders renumber every sibling, so most block mutations persist the WHOLE
      // page's blocks (not just the one that was clicked).
      const pushPageBlocks = (pageId: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        get().blocks
          .filter((b) => b.pageId === pageId)
          .forEach((b) => wikiApi.putBlock(cid, b).catch(err("putBlock")));
      };

      return {
        spaces: [],
        pages: [],
        blocks: [],
        members: [],
        history: [],
        views: {},
        currentUserId: null,

        currentCompanyId: null,
        loading: false,
        loadedCompanies: [],

        recordView: (pageId) =>
          set((s) => {
            const me = s.currentUserId ?? "system";
            const page = (s.views[pageId] ?? {}) as Record<string, { at: string; count: number }>;
            const prev = page[me];
            // Count a new "open" only if the last one was > 10 min ago (a fresh session).
            const fresh = !prev || Date.now() - new Date(prev.at).getTime() > 10 * 60_000;
            return {
              views: { ...s.views, [pageId]: { ...page, [me]: { at: nowISO(), count: (prev?.count ?? 0) + (fresh ? 1 : 0) } } },
            };
          }),

        ensureUser: (username) => {
          const id = `me:${username || "guest"}`;
          set((s) => {
            const next: Partial<WikiState> = { currentUserId: id };
            if (!s.members.some((m) => m.id === id)) {
              const nm = (username || "Men").replace(/^\w/, (c) => c.toUpperCase());
              next.members = [{ id, name: nm }, ...s.members];
            }
            return next;
          });
          return id;
        },

        // Load the shared wiki for a company from the server, REPLACING the
        // in-memory wiki (one company is viewed at a time). If the server has no
        // spaces yet, seed a default space + welcome page and persist it. Guards
        // against double-load (StrictMode / rapid re-renders) via currentCompanyId.
        loadWiki: async (companyId) => {
          const s = get();
          if (
            s.currentCompanyId === companyId &&
            (s.loading || s.loadedCompanies.includes(companyId))
          )
            return;

          set({ currentCompanyId: companyId, loading: true });
          try {
            const data = await wikiApi.getWiki(companyId);
            set({
              spaces: data.spaces ?? [],
              pages: data.pages ?? [],
              blocks: data.blocks ?? [],
            });

            if (!data.spaces || data.spaces.length === 0) {
              seedWiki(companyId);
            }

            set((st) => ({
              loading: false,
              loadedCompanies: st.loadedCompanies.includes(companyId)
                ? st.loadedCompanies
                : [...st.loadedCompanies, companyId],
            }));
          } catch (e) {
            console.error("[wiki] loadWiki failed", e);
            set({ loading: false });
          }
        },

        setMembers: (incoming) =>
          set((s) => {
            const meId = s.currentUserId;
            const meEntry = s.members.find((m) => m.id === meId);
            const rest = incoming.filter((m) => m.id !== meId);
            const next = meEntry ? [meEntry, ...rest] : rest;
            const same =
              next.length === s.members.length &&
              next.every((m, i) => s.members[i]?.id === m.id && s.members[i]?.name === m.name);
            return same ? s : { members: next };
          }),

        // ── spaces ──
        createSpace: (companyId, name, icon) => {
          const id = uid();
          const me = get().currentUserId ?? "system";
          set((s) => {
            const order = s.spaces.filter((sp) => sp.companyId === companyId).length;
            const space: Space = {
              id, companyId, name: name.trim() || "Makon", icon: icon || "📚", order,
              ownerId: me, access: {}, everyone: null, createdAt: nowISO(),
            };
            return { spaces: [...s.spaces, space] };
          });
          pushSpace(id);
          return id;
        },

        updateSpace: (id, patch) => {
          set((s) => ({ spaces: s.spaces.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)) }));
          pushSpace(id);
        },

        deleteSpace: (id) => {
          set((s) => {
            const pageIds = new Set(s.pages.filter((p) => p.spaceId === id).map((p) => p.id));
            return {
              spaces: s.spaces.filter((sp) => sp.id !== id),
              pages: s.pages.filter((p) => p.spaceId !== id),
              blocks: s.blocks.filter((b) => !pageIds.has(b.pageId)),
            };
          });
          // Server FK-cascades this space's pages + blocks.
          const cid = get().currentCompanyId;
          if (cid != null) wikiApi.deleteSpace(cid, id).catch(err("deleteSpace"));
        },

        setSpaceAccess: (spaceId, memberId, role) => {
          set((s) => ({
            spaces: s.spaces.map((sp) => {
              if (sp.id !== spaceId) return sp;
              const access = { ...sp.access };
              if (role) access[memberId] = role;
              else delete access[memberId];
              return { ...sp, access };
            }),
          }));
          pushSpace(spaceId);
        },

        setSpaceEveryone: (spaceId, role) => {
          set((s) => ({ spaces: s.spaces.map((sp) => (sp.id === spaceId ? { ...sp, everyone: role } : sp)) }));
          pushSpace(spaceId);
        },

        // ── pages ──
        createPage: (spaceId, parentId, opts) => {
          const id = uid();
          set((s) => {
            const me = s.currentUserId ?? "system";
            const order = s.pages.filter((p) => p.spaceId === spaceId && p.parentId === parentId).length;
            const page: Page = {
              id, spaceId, parentId: parentId ?? null,
              title: opts?.title ?? "", icon: opts?.icon ?? "📄", order,
              createdAt: nowISO(), updatedAt: nowISO(), lastEditedBy: me,
            };
            // Every new page starts with one empty text block so the caret has a home.
            const block: Block = { id: uid(), pageId: id, type: "text", text: "", order: 0 };
            return { pages: [...s.pages, page], blocks: [...s.blocks, block], history: pushHistory(s.history, id, me, "created") };
          });
          // Persist the new page and its seed block.
          pushPage(id);
          pushPageBlocks(id);
          return id;
        },

        duplicatePage: (id) => {
          const src = get().pages.find((p) => p.id === id);
          if (!src) return null;
          const newId = uid();
          set((s) => {
            const me = s.currentUserId ?? "system";
            // Insert right after the source among its siblings.
            const siblings = s.pages
              .filter((p) => p.spaceId === src.spaceId && p.parentId === src.parentId)
              .sort((a, b) => a.order - b.order);
            const at = siblings.findIndex((p) => p.id === id) + 1;
            const copy: Page = {
              ...src,
              id: newId,
              title: src.title ? `${src.title} (nusxa)` : "",
              order: at,
              createdAt: nowISO(),
              updatedAt: nowISO(),
              lastEditedBy: me,
            };
            // Deep-copy every block, remapping ids so nested (parentBlockId) links
            // stay intact within the copy.
            const srcBlocks = s.blocks.filter((b) => b.pageId === id).sort((a, b) => a.order - b.order);
            const idMap = new Map<string, string>();
            srcBlocks.forEach((b) => idMap.set(b.id, uid()));
            const copiedBlocks: Block[] = srcBlocks.map((b, i) => ({
              ...b,
              id: idMap.get(b.id)!,
              pageId: newId,
              parentBlockId: b.parentBlockId ? idMap.get(b.parentBlockId) ?? null : null,
              order: i,
            }));
            // Bump following siblings so the copy slots in directly after the source.
            const pages = s.pages.map((p) =>
              p.spaceId === src.spaceId && p.parentId === src.parentId && p.order >= at ? { ...p, order: p.order + 1 } : p,
            );
            return {
              pages: [...pages, copy],
              blocks: [...s.blocks, ...copiedBlocks],
              history: pushHistory(s.history, newId, me, "created"),
            };
          });
          // Persist the new page, its copied blocks, and any bumped siblings.
          const copyPage = get().pages.find((p) => p.id === newId);
          if (copyPage) {
            const affected = get().pages.filter(
              (p) => p.spaceId === copyPage.spaceId && p.parentId === copyPage.parentId,
            );
            pushPages(affected.map((p) => p.id));
          }
          pushPageBlocks(newId);
          return newId;
        },

        updatePage: (id, patch) => {
          set((s) => {
            const prev = s.pages.find((p) => p.id === id);
            const me = s.currentUserId ?? "system";
            const kind: PageHistoryKind = prev && patch.title != null && patch.title !== prev.title ? "renamed" : "edited";
            return {
              pages: s.pages.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowISO(), lastEditedBy: me } : p)),
              history: prev ? pushHistory(s.history, id, me, kind) : s.history,
            };
          });
          pushPage(id);
        },

        deletePage: (id) => {
          const ids = [...subtreeIds(get().pages, id)];
          set((s) => {
            const sub = subtreeIds(s.pages, id);
            return {
              pages: s.pages.filter((p) => !sub.has(p.id)),
              blocks: s.blocks.filter((b) => !sub.has(b.pageId)),
            };
          });
          // Delete every page in the subtree on the server (each FK-cascades its
          // blocks); done explicitly so descendant pages don't outlive the parent.
          const cid = get().currentCompanyId;
          if (cid != null) ids.forEach((pid) => wikiApi.deletePage(cid, pid).catch(err("deletePage")));
        },

        movePage: (id, parentId, index) => {
          set((s) => {
            const page = s.pages.find((p) => p.id === id);
            if (!page) return s;
            // Guard against dropping a page into its own subtree.
            const forbidden = subtreeIds(s.pages, id);
            if (parentId && forbidden.has(parentId)) return s;
            const siblings = s.pages
              .filter((p) => p.spaceId === page.spaceId && p.parentId === parentId && p.id !== id)
              .sort((a, b) => a.order - b.order);
            const idx = Math.max(0, Math.min(index, siblings.length));
            siblings.splice(idx, 0, { ...page, parentId });
            const orderById = new Map(siblings.map((p, i) => [p.id, i]));
            const me = s.currentUserId ?? "system";
            return {
              pages: s.pages.map((p) => {
                if (p.id === id) return { ...p, parentId, order: orderById.get(id)!, updatedAt: nowISO(), lastEditedBy: me };
                return orderById.has(p.id) ? { ...p, order: orderById.get(p.id)! } : p;
              }),
              history: pushHistory(s.history, id, me, "moved"),
            };
          });
          // Reordering shifts sibling `order` too → persist the moved page and its
          // whole (new) sibling group, not just the one that was dragged.
          const moved = get().pages.find((p) => p.id === id);
          if (moved) {
            const affected = get().pages.filter(
              (p) => p.spaceId === moved.spaceId && p.parentId === moved.parentId,
            );
            pushPages(affected.map((p) => p.id));
          }
        },

        // ── blocks ── (order is the source of truth; array position is irrelevant)
        createBlock: (pageId, afterId, type = "text", text = "", parentBlockId = null) => {
          const id = uid();
          set((s) => {
            const me = s.currentUserId ?? "system";
            const inPage = s.blocks.filter((b) => b.pageId === pageId).sort((a, b) => a.order - b.order);
            const at = afterId ? inPage.findIndex((b) => b.id === afterId) + 1 : inPage.length;
            inPage.splice(Math.max(0, at), 0, { id, pageId, type, text, order: 0, parentBlockId });
            return {
              blocks: [...s.blocks.filter((b) => b.pageId !== pageId), ...renumber(inPage)],
              pages: s.pages.map((p) => (p.id === pageId ? { ...p, updatedAt: nowISO(), lastEditedBy: me } : p)),
              history: pushHistory(s.history, pageId, me, "edited"),
            };
          });
          // Insertion renumbers following siblings → persist all page blocks + page.
          pushPageBlocks(pageId);
          pushPage(pageId);
          return id;
        },

        updateBlock: (id, patch) => {
          set((s) => {
            const block = s.blocks.find((b) => b.id === id);
            if (!block) return s;
            const me = s.currentUserId ?? "system";
            return {
              blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
              pages: s.pages.map((p) => (p.id === block.pageId ? { ...p, updatedAt: nowISO(), lastEditedBy: me } : p)),
              history: pushHistory(s.history, block.pageId, me, "edited"),
            };
          });
          const block = get().blocks.find((b) => b.id === id);
          pushBlock(id);
          if (block) pushPage(block.pageId);
        },

        deleteBlock: (id) => {
          const block = get().blocks.find((b) => b.id === id);
          set((s) => {
            const target = s.blocks.find((b) => b.id === id);
            if (!target) return s;
            const me = s.currentUserId ?? "system";
            // A deleted toggle promotes its children back to top-level.
            const cleaned = s.blocks
              .filter((b) => b.id !== id)
              .map((b) => (b.parentBlockId === id ? { ...b, parentBlockId: null } : b));
            const inPage = renumber(cleaned.filter((b) => b.pageId === target.pageId).sort((a, b) => a.order - b.order));
            return {
              blocks: [...cleaned.filter((b) => b.pageId !== target.pageId), ...inPage],
              pages: s.pages.map((p) => (p.id === target.pageId ? { ...p, updatedAt: nowISO(), lastEditedBy: me } : p)),
            };
          });
          const cid = get().currentCompanyId;
          if (cid == null || !block) return;
          const pageId = block.pageId;
          // Delete on the server, then re-persist the surviving page blocks
          // (orders renumbered, promoted children reparented) so they outlive any
          // FK-cascade, plus the page (updatedAt bumped).
          wikiApi
            .deleteBlock(cid, id)
            .then(() => {
              const cid2 = get().currentCompanyId;
              if (cid2 == null) return;
              get()
                .blocks.filter((b) => b.pageId === pageId)
                .forEach((b) => wikiApi.putBlock(cid2, b).catch(err("putBlock")));
            })
            .catch((e) => {
              err("deleteBlock")(e);
              get().loadWiki(cid);
            });
          pushPage(pageId);
        },

        moveBlock: (id, toIndex) => {
          const pageId = get().blocks.find((b) => b.id === id)?.pageId;
          set((s) => {
            const block = s.blocks.find((b) => b.id === id);
            if (!block) return s;
            const inPage = s.blocks.filter((b) => b.pageId === block.pageId).sort((a, b) => a.order - b.order);
            const from = inPage.findIndex((b) => b.id === id);
            const [moved] = inPage.splice(from, 1);
            inPage.splice(Math.max(0, Math.min(toIndex, inPage.length)), 0, moved);
            return { blocks: [...s.blocks.filter((b) => b.pageId !== block.pageId), ...renumber(inPage)] };
          });
          // Reorder renumbers every sibling → persist all blocks in the page.
          if (pageId) pushPageBlocks(pageId);
        },

        toggleCollapse: (id) => {
          set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, collapsed: !b.collapsed } : b)) }));
          pushBlock(id);
        },

        // Nest the block under the block directly above it (Notion Tab). Only allowed
        // when the block above is a top-level block (single-level nesting for now).
        indentBlock: (id) => {
          set((s) => {
            const block = s.blocks.find((b) => b.id === id);
            if (!block || block.parentBlockId) return s;
            const inPage = s.blocks.filter((b) => b.pageId === block.pageId).sort((a, b) => a.order - b.order);
            const i = inPage.findIndex((b) => b.id === id);
            const above = inPage[i - 1];
            if (!above || above.parentBlockId) return s;
            return { blocks: s.blocks.map((b) => (b.id === id ? { ...b, parentBlockId: above.id } : b)) };
          });
          pushBlock(id);
        },

        outdentBlock: (id) => {
          set((s) => ({ blocks: s.blocks.map((b) => (b.id === id ? { ...b, parentBlockId: null } : b)) }));
          pushBlock(id);
        },
      };

      // ── seed ────────────────────────────────────────────────────────────────
      // Build a shared starter space for an empty company: a default "knowledge
      // base" space, a welcome page and its blocks. Applied locally AND pushed to
      // the server so every user of the company sees the same seed. No mock people
      // — real members are pulled live from AIBA (see setMembers / useCompanyMembers).
      function seedWiki(companyId: number) {
        const me = get().currentUserId ?? "system";

        const spaceId = uid();
        const space: Space = {
          id: spaceId,
          companyId,
          name: "Bilimlar bazasi",
          icon: "📚",
          order: 0,
          ownerId: me,
          access: {},
          everyone: "edit", // shared with the whole firm by default
          createdAt: nowISO(),
        };
        const pageId = uid();
        const page: Page = {
          id: pageId,
          spaceId,
          parentId: null,
          title: "Xush kelibsiz",
          icon: "👋",
          cover: "sky",
          order: 0,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        const mk = (type: BlockType, text: string, i: number): Block => ({ id: uid(), pageId, type, text, order: i });
        const blocks: Block[] = [
          mk("h1", "Bilimlar bazasiga xush kelibsiz", 0),
          mk("text", "Bu — jamoangizning Wiki bo'limi. Har bir korxona uchun alohida makon (space), ichida esa cheksiz sahifalar tuzishingiz mumkin.", 1),
          mk("h2", "Nimalar qilsa bo'ladi", 2),
          mk("bulleted", "Sahifa va ichki sahifalar yarating", 3),
          mk("bulleted", "\"/\" bosib blok turini tanlang (sarlavha, ro'yxat, kod…)", 4),
          mk("todo", "Kimga ko'rish yoki tahrirlash huquqi berishni belgilang", 5),
          mk("callout", "Maslahat: chapdagi paneldan yangi sahifa qo'shing yoki bloklarni sichqoncha bilan suring.", 6),
        ];

        set((s) => ({
          spaces: [...s.spaces, space],
          pages: [...s.pages, page],
          blocks: [...s.blocks, ...blocks],
        }));

        // Persist the seed so it is shared, not just local.
        wikiApi.putSpace(companyId, space).catch(err("putSpace"));
        wikiApi.putPage(companyId, page).catch(err("putPage"));
        blocks.forEach((b) => wikiApi.putBlock(companyId, b).catch(err("putBlock")));
      }
    },
    {
      name: "aiba.wiki.prefs",
      version: 1,
      // Only client-only stats (per-page view counts + the edit timeline) are
      // persisted to localStorage; the wiki data now lives on the server (see
      // loadWiki / wiki-api.ts). Uses a NEW storage key so any legacy
      // "aiba.wiki.local" board data is ignored rather than shadowing the server.
      partialize: (s) => ({ views: s.views, history: s.history }),
    },
  ),
);
