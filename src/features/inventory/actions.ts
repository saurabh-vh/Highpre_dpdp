"use server";

import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { PURPOSE_PRESETS } from "@/lib/constants";
import { LANG_CODES } from "@/lib/i18n/languages";
import { purposeSchema } from "@/lib/validation";
import { Site } from "@/models";

function readPurpose(formData: FormData) {
  // Only languages shown in the form; others are carried over by savePurposeAction.
  const translations = LANG_CODES.filter((l) => l !== "en" && formData.has(`name_${l}`))
    .map((lang) => ({
      lang,
      name: String(formData.get(`name_${lang}`) ?? "").trim(),
      description: String(formData.get(`description_${lang}`) ?? "").trim(),
    }))
    .filter((t) => t.name || t.description);
  return {
    key: formData.get("key"),
    name: formData.get("name"),
    description: formData.get("description"),
    translations,
    dataCategories: formData.getAll("dataCategories"),
    essential: formData.get("essential") === "on",
    tracking: formData.get("tracking") === "on",
    retentionDays: formData.get("retentionDays"),
    storedIn: formData.get("storedIn") ?? "",
    sharedWith: formData.get("sharedWith") ?? "",
  };
}

/**
 * Creates or updates a purpose. `originalKey` is the key being edited, or
 * empty when adding a new one.
 */
export async function savePurposeAction(siteId: string, originalKey: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const site = await requireSite(siteId);
  const parsed = purposeSchema.safeParse(readPurpose(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const purpose = parsed.data;
  if (purpose.essential && purpose.tracking) {
    return { ok: false, fieldErrors: { tracking: ["Tracking and advertising can't be essential."] } };
  }

  const others = site.purposes.filter((p) => p.key !== originalKey);
  if (others.some((p) => p.key === purpose.key)) {
    return { ok: false, fieldErrors: { key: ["Another purpose already uses this key."] } };
  }

  // Keep translations for languages the site doesn't currently offer (not in the form).
  const previous = site.purposes.find((p) => p.key === originalKey);
  const inForm = new Set(LANG_CODES.filter((l) => formData.has(`name_${l}`)));
  const kept = (previous?.translations ?? []).filter((t) => !inForm.has(t.lang as never));
  // Translations replace the legacy Hindi fields once a purpose is saved.
  const keepLegacyHi = !inForm.has("hi");
  const saved = {
    ...purpose,
    translations: [...kept, ...purpose.translations],
    nameHi: keepLegacyHi ? (previous?.nameHi ?? "") : "",
    descriptionHi: keepLegacyHi ? (previous?.descriptionHi ?? "") : "",
  };
  const purposes = originalKey ? site.purposes.map((p) => (p.key === originalKey ? saved : p)) : [...site.purposes, saved];

  await Site.updateOne({ _id: site._id }, { purposes });
  await audit(org._id, user, originalKey ? "inventory.updated" : "inventory.added", `${originalKey ? "Updated" : "Added"} the purpose "${purpose.name}" on ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed(originalKey ? "Purpose updated. Publish your notice again to apply it." : "Purpose added. Publish your notice again to apply it.");
}

export async function deletePurposeAction(siteId: string, key: string): Promise<void> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return;
  const site = await requireSite(siteId);
  const purpose = site.purposes.find((p) => p.key === key);
  await Site.updateOne({ _id: site._id }, { $pull: { purposes: { key } } });
  if (purpose) await audit(org._id, user, "inventory.removed", `Removed the purpose "${purpose.name}" from ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
}

export async function addPresetPurposeAction(siteId: string, presetKey: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const site = await requireSite(siteId);
  const preset = PURPOSE_PRESETS.find((p) => p.key === presetKey);
  if (!preset) return fail("Unknown preset.");
  if (site.purposes.some((p) => p.key === preset.key)) return fail("That purpose is already listed.");
  await Site.updateOne({ _id: site._id }, { $push: { purposes: { ...preset, dataCategories: [...preset.dataCategories] } } });
  await audit(org._id, user, "inventory.added", `Added the purpose "${preset.name}" on ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed("Purpose added.");
}
