import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import type { NoticeContent } from "@/lib/notice/generate";

/**
 * An immutable, versioned privacy notice. Each consent record references the
 * version the person saw, which is what makes consent provable later.
 */
const noticeSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    version: { type: Number, required: true },
    /** Keyed by language code: { en: { title, intro, sections }, hi: {...}, ... }. */
    content: { type: Schema.Types.Mixed, required: true },
    languages: { type: [String], default: ["en", "hi"] },
    purposeKeys: { type: [String], default: [] },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

noticeSchema.index({ siteId: 1, version: -1 }, { unique: true });

export type NoticeDoc = Omit<InferSchemaType<typeof noticeSchema>, "content"> & { content: NoticeContent };
export const Notice: Model<NoticeDoc> = models.Notice ?? model("Notice", noticeSchema);
