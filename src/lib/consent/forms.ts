/**
 * Form consent: the site settings behind the checkboxes widget/src/forms.js
 * adds to a website's own forms. Pure functions, shared by the public config
 * route and the dashboard.
 */

type PurposeLike = { key: string; essential?: boolean | null; tracking?: boolean | null };
export type FormSettings = { autoProtect?: boolean | null; purposes?: string[] | null; requiredPurposes?: string[] | null } | null | undefined;

/** Longest form identifier stored in the ledger (id, name or action path). */
export const FORM_ID_MAX = 100;

/** The forms block of the widget config. Purposes no longer in the inventory are dropped. */
export function formsConfig(purposes: PurposeLike[], settings: FormSettings) {
  const known = new Set(purposes.map((p) => p.key));
  const selected = (settings?.purposes ?? []).filter((k) => known.has(k));
  return {
    auto: Boolean(settings?.autoProtect) && selected.length > 0,
    purposes: selected,
    required: (settings?.requiredPurposes ?? []).filter((k) => known.has(k)),
  };
}

/**
 * Purposes to suggest for a form found by a scan: the ones chosen for forms,
 * otherwise every optional purpose that isn't tracking (a lead form is about
 * contacting the person, not profiling them).
 */
export function suggestedFormPurposes(purposes: PurposeLike[], settings: FormSettings): string[] {
  const chosen = formsConfig(purposes, settings).purposes;
  if (chosen.length > 0) return chosen;
  return purposes.filter((p) => !p.essential && !p.tracking).map((p) => p.key);
}

/** The opening <form> tag to paste for a set of purposes. */
export function formAttributeSnippet(keys: string[], required: string[] = []): string {
  const req = required.filter((k) => keys.includes(k));
  return `<form data-hp-consent="${keys.join(",")}"${req.length ? ` data-hp-required="${req.join(",")}"` : ""}>`;
}
