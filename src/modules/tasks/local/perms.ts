import type { Column, Project, TaskPermission, TaskRole } from "./model";

// System role permission sets (mirror of the backend's system_task_role).
const SYSTEM: Record<string, TaskPermission[]> = {
  owner: ["view", "create", "edit", "move", "delete", "comment", "manage", "autotask"],
  member: ["view", "create", "edit", "move", "comment"],
  viewer: ["view", "comment"],
};

/**
 * The effective role KEY for a user in a project:
 *  - the project owner, or a tenant admin → "owner" (full access);
 *  - an explicit access grant → its roleKey;
 *  - otherwise → "member" (sensible default so nobody is locked out until
 *    roles are actually assigned).
 */
export function myRoleKey(project: Project, userId: string | null, isAdmin: boolean): string {
  if (isAdmin) return "owner";
  if (userId && project.ownerId === userId) return "owner";
  const grant = userId ? project.access?.find((a) => a.userId === userId) : undefined;
  return grant?.roleKey ?? "member";
}

/** Resolve a role key to its permission set (system or custom). */
export function permsFor(roleKey: string, roles: TaskRole[]): Set<TaskPermission> {
  if (SYSTEM[roleKey]) return new Set(SYSTEM[roleKey]);
  const custom = roles.find((r) => r.key === roleKey);
  return new Set(custom?.permissions ?? SYSTEM.member);
}

/** Convenience: the user's permission set for a project. */
export function myPerms(
  project: Project | null,
  userId: string | null,
  isAdmin: boolean,
  roles: TaskRole[],
): Set<TaskPermission> {
  if (!project) return new Set();
  return permsFor(myRoleKey(project, userId, isAdmin), roles);
}

/** Whether the user's role may move a card INTO `column`. */
export function canMoveTo(column: Column | undefined, roleKey: string, perms: Set<TaskPermission>): boolean {
  if (roleKey === "owner") return true;
  if (!perms.has("move")) return false;
  const allowed = column?.moveRoles ?? [];
  return allowed.length === 0 || allowed.includes(roleKey);
}
