import "server-only";
import type { Types } from "mongoose";
import { log } from "./log";
import { AuditLog } from "@/models";

type Actor = { id: string; name: string } | null;

/**
 * Appends an entry to the organisation's activity log. Never throws: a
 * logging failure must not undo the change it describes.
 */
export async function audit(orgId: Types.ObjectId | string, actor: Actor, action: string, summary: string, siteId?: Types.ObjectId | string): Promise<void> {
  try {
    await AuditLog.create({
      orgId,
      actorId: actor?.id,
      actorName: actor?.name ?? "HighPre",
      action,
      summary: summary.slice(0, 300),
      siteId,
    });
  } catch (error) {
    log.error("audit.write_failed", { action, error: String(error) });
  }
}
