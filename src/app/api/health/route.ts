import mongoose from "mongoose";
import { connectDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness and database check for uptime monitors and Docker. */
export async function GET() {
  try {
    await connectDb();
    return Response.json({ ok: true, db: mongoose.connection.readyState === 1 });
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 });
  }
}
