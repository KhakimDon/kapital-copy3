import { api } from "@/shared/api/client";
import type { Card, Column, Comment, EpicRef, Project, TaskRole } from "./local/model";

// ─────────────────────────────────────────────────────────────────────────────
// Server-persistence adapter for the tasks board. Every board entity carries a
// client-minted string id; every write is an idempotent UPSERT — we PUT the FULL
// object. Access is per-company. These are plain async helpers (not hooks); the
// zustand store calls them fire-and-forget after its optimistic local `set`.
// ─────────────────────────────────────────────────────────────────────────────

export type BoardResponse = {
  projects: Project[]; // ALL projects for the company (switcher metadata)
  columns: Column[]; // ONLY for `loaded_project`
  cards: Card[]; // ONLY for `loaded_project`
  comments: Comment[]; // ONLY for `loaded_project`'s cards
  loaded_project: string | null; // which project's columns/cards/comments this response carries
};

const base = (companyId: number) => `/tasks/board/${companyId}`;

// Omitting `projectId` returns the FIRST project's data (+ all projects).
export async function getBoard(companyId: number, projectId?: string): Promise<BoardResponse> {
  const url = projectId ? `${base(companyId)}?project=${encodeURIComponent(projectId)}` : base(companyId);
  return (await api.get<BoardResponse>(url)).data;
}

// Cross-project epics for the whole company (epic picker + chips).
export async function getEpics(companyId: number): Promise<EpicRef[]> {
  return (await api.get<{ items: EpicRef[] }>(`${base(companyId)}/epics`)).data.items;
}

// ── task permission roles (tenant-wide) ──
export async function getRoles(companyId: number): Promise<TaskRole[]> {
  return (await api.get<{ items: TaskRole[] }>(`${base(companyId)}/roles`)).data.items;
}
export async function putRole(companyId: number, role: TaskRole) {
  return (await api.put(`${base(companyId)}/roles/${role.id}`, role)).data;
}
export async function deleteRole(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/roles/${id}`)).data;
}

// ── projects ──
export async function putProject(companyId: number, project: Project) {
  return (await api.put(`${base(companyId)}/projects/${project.id}`, project)).data;
}
export async function deleteProject(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/projects/${id}`)).data;
}

// ── columns ──
export async function putColumn(companyId: number, column: Column) {
  return (await api.put(`${base(companyId)}/columns/${column.id}`, column)).data;
}
export async function deleteColumn(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/columns/${id}`)).data;
}

// ── cards ──
export async function putCard(companyId: number, card: Card) {
  return (await api.put(`${base(companyId)}/cards/${card.id}`, card)).data;
}
export async function deleteCard(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/cards/${id}`)).data;
}

// ── comments ──
export async function putComment(companyId: number, comment: Comment) {
  return (await api.put(`${base(companyId)}/comments/${comment.id}`, comment)).data;
}
export async function deleteComment(companyId: number, id: string) {
  return (await api.delete(`${base(companyId)}/comments/${id}`)).data;
}
