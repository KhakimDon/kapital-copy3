import { api } from "@/shared/api/client";
import type { Block, Page, Space } from "./local/model";

// ─────────────────────────────────────────────────────────────────────────────
// Server-persistence adapter for the Wiki knowledge base. Every entity carries a
// client-minted string id; every write is an idempotent UPSERT — we PUT the FULL
// object. Access is per-company. These are plain async helpers (not hooks); the
// zustand store calls them fire-and-forget after its optimistic local `set`.
// Server FK-cascades: deleting a space removes its pages+blocks; deleting a page
// removes its blocks.
// ─────────────────────────────────────────────────────────────────────────────

export type WikiResponse = {
  spaces: Space[];
  pages: Page[];
  blocks: Block[];
};

const base = (companyId: number) => `/wiki/${companyId}`;

export async function getWiki(companyId: number): Promise<WikiResponse> {
  return (await api.get<WikiResponse>(base(companyId))).data;
}

// ── spaces ──
export async function putSpace(companyId: number, space: Space) {
  return (await api.put(`${base(companyId)}/spaces/${space.id}`, space)).data;
}
export async function deleteSpace(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/spaces/${id}`)).data;
}

// ── pages ──
export async function putPage(companyId: number, page: Page) {
  return (await api.put(`${base(companyId)}/pages/${page.id}`, page)).data;
}
export async function deletePage(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/pages/${id}`)).data;
}

// ── blocks ──
export async function putBlock(companyId: number, block: Block) {
  return (await api.put(`${base(companyId)}/blocks/${block.id}`, block)).data;
}
export async function deleteBlock(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/blocks/${id}`)).data;
}
