/**
 * What each role may do. Client-safe so the UI can hide controls, but every
 * server action checks again with `requirePermission`.
 *
 * - owner: everything, including billing and transferring ownership
 * - admin: team, settings, websites and notices
 * - member: day-to-day work: scans, inventory, banner, requests, breaches
 */
export type Permission =
  | "billing"
  | "team"
  | "settings"
  | "sites.manage"
  | "notice.publish"
  | "content.edit"
  | "requests"
  | "breaches";

const MATRIX: Record<string, Permission[]> = {
  owner: ["billing", "team", "settings", "sites.manage", "notice.publish", "content.edit", "requests", "breaches"],
  admin: ["team", "settings", "sites.manage", "notice.publish", "content.edit", "requests", "breaches"],
  member: ["content.edit", "requests", "breaches"],
};

export const can = (role: string | null | undefined, permission: Permission) => (MATRIX[role ?? ""] ?? []).includes(permission);

export const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };
export const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Everything, including billing.",
  admin: "Team, settings, websites and notices.",
  member: "Scans, inventory, banner, requests and breaches.",
};
