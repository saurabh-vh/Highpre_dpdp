// Types for the pure helpers in forms.js, so the TypeScript tests can import them.
export type FieldInfo = { type?: string | null; name?: string | null; id?: string | null; placeholder?: string | null; autocomplete?: string | null; ariaLabel?: string | null };
export type FormInfo = { id?: string | null; name?: string | null; action?: string | null; role?: string | null; className?: string | null; fields?: FieldInfo[] };
export type FormPurpose = { key: string; required: boolean };
export type FormsConfig = { purposes?: { key: string }[]; forms?: { auto?: boolean; purposes?: string[]; required?: string[] } };

export function splitKeys(value: string | null | undefined): string[];
export function fieldKind(f: FieldInfo): "email" | "tel" | "name" | null;
export function isExcludedForm(form: FormInfo): boolean;
export function isAutoEligible(form: FormInfo): boolean;
export function formIdentifier(form: FormInfo, base?: string): string;
export function resolvePurposes(spec: { consent: string | null; required: string | null; auto: boolean }, config: FormsConfig): FormPurpose[];
export function missingRequired(purposes: FormPurpose[], checked: Record<string, boolean>): string[];
export function uuid(c: { randomUUID?: () => string; getRandomValues<T extends ArrayBufferView>(a: T): T }): string;
export function formPayload(o: {
  siteKey: string;
  principalId: string;
  version: number;
  purposes: FormPurpose[];
  checked: Record<string, boolean>;
  lang: string;
  pageUrl: string;
  formId: string;
  receiptId: string;
}): Record<string, unknown>;
export function initForms(ctx: unknown): void;
