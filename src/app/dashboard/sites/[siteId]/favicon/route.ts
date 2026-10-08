import { Types } from "mongoose";
import { requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { Site } from "@/models";

/** Serves a site's cached favicon to signed-in members of its organisation. */
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  // Sidebar icons also load on the Account page while 2FA setup is pending.
  const { org } = await requireAuthWithoutPolicy();
  if (!Types.ObjectId.isValid(siteId)) return new Response(null, { status: 404 });
  const site = await Site.findOne({ _id: siteId, orgId: org._id }).select("+favicon.data favicon.contentType").lean();
  const icon = site?.favicon;
  if (!icon?.data || !icon.contentType) return new Response(null, { status: 404 });
  // Lean queries return BSON Binary rather than Buffer; both expose the bytes.
  const raw = icon.data as unknown as Uint8Array | { buffer: Uint8Array };
  const bytes = raw instanceof Uint8Array ? raw : raw.buffer;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": icon.contentType,
      "Cache-Control": "private, max-age=86400",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
