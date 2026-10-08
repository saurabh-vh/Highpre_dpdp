"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { LanguagePicker } from "@/components/consent/language-picker";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { postJson } from "@/features/rights-portal/rights-portal";
import { getLocale } from "@/lib/i18n";

type Purpose = { key: string; essential: boolean; tracking: boolean; text: Record<string, { name: string; description: string }> };
type Errors = Record<string, string[] | undefined>;

/** Parent or guardian verifies their email, declares their relationship and chooses purposes for a child visitor. */
export function ParentalPortal({
  siteKey,
  principalId,
  businessName,
  languages,
  initialLang,
  purposes,
}: {
  siteKey: string;
  principalId: string | null;
  businessName: string;
  languages: string[];
  initialLang: string;
  purposes: Purpose[];
}) {
  const [lang, setLang] = useState(initialLang);
  const [step, setStep] = useState<"email" | "details" | "done">("email");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const t = getLocale(lang).parental;
  const text = (p: Purpose) => p.text[lang] ?? p.text.en;

  async function requestCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { ok, data } = await postJson("/api/public/rights/otp", { siteKey, email, purpose: "parental" });
    setPending(false);
    if (!ok) return setError(data.error ?? t.genericError);
    setStep("details");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setFieldErrors({});
    const { ok, data } = await postJson("/api/public/parental/submit", {
      siteKey,
      principalId,
      email,
      code: form.get("code"),
      parentName: form.get("parentName"),
      childName: form.get("childName"),
      relationship: form.get("relationship"),
      purposes: form.getAll("purposes"),
      declaration: form.get("declaration") === "on",
      language: lang,
    });
    setPending(false);
    if (!ok) {
      setError(data.error ?? t.genericError);
      setFieldErrors(data.fieldErrors ?? {});
      return;
    }
    setStep("done");
  }

  return (
    <div lang={lang}>
      <LanguagePicker languages={languages} value={lang} onChange={setLang} />

      {step === "done" ? (
        <div className="animate-rise-in">
          <CheckCircle2 className="mb-6 size-10 text-success" strokeWidth={1.4} aria-hidden />
          <h1 className="text-2xl font-semibold">{t.doneTitle}</h1>
          <p className="mt-4 text-sm leading-relaxed text-fog">{t.done}</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-balance">{t.title(businessName)}</h1>
          <p className="mt-3 text-sm leading-relaxed text-mist">{t.intro}</p>

          {!principalId ? (
            <Callout tone="warning" className="mt-10">{t.missingLink}</Callout>
          ) : (
            <div className="mt-10 rounded-panel border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              {error && <FormMessage state={{ ok: false, message: error }} className="mb-6" />}

              {step === "email" ? (
                <form onSubmit={requestCode} className="space-y-5">
                  <Field label={t.parentEmail} name="email">
                    <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  <Button type="submit" className="w-full" size="lg" disabled={pending || !email}>
                    {pending && <Spinner />}
                    {pending ? t.sending : t.sendCode}
                  </Button>
                </form>
              ) : (
                <form onSubmit={submit} className="space-y-6" noValidate>
                  <p className="text-xs text-fog">
                    {t.codeSent(email)}{" "}
                    <button type="button" onClick={() => setStep("email")} className="underline underline-offset-4">
                      {t.changeEmail}
                    </button>
                  </p>
                  <Field label={t.code} name="code" errors={fieldErrors.code}>
                    <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-[0.4em]" autoFocus />
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label={t.parentName} name="parentName" errors={fieldErrors.parentName}>
                      <Input autoComplete="name" />
                    </Field>
                    <Field label={t.relationship} name="relationship" errors={fieldErrors.relationship}>
                      <Select defaultValue="parent">
                        <option value="parent">{t.relParent}</option>
                        <option value="guardian">{t.relGuardian}</option>
                      </Select>
                    </Field>
                  </div>
                  <Field label={t.childName} name="childName" hint={t.childNameHint} errors={fieldErrors.childName}>
                    <Input autoComplete="off" />
                  </Field>

                  <fieldset>
                    <legend className="text-xs font-medium text-fog">{t.purposesLegend}</legend>
                    <p className="mt-1 text-2xs text-mist">{t.purposesHint}</p>
                    <ul className="mt-3 divide-y divide-white/[0.08] rounded-field border border-white/10">
                      {purposes.map((p) => {
                        const locked = p.essential || p.tracking;
                        return (
                          <li key={p.key}>
                            <label className={locked ? "flex gap-3 px-4 py-3 opacity-70" : "flex cursor-pointer gap-3 px-4 py-3"}>
                              <input
                                type="checkbox"
                                name="purposes"
                                value={p.key}
                                defaultChecked={p.essential}
                                disabled={locked}
                                className="mt-0.5 size-4 accent-white"
                              />
                              <span>
                                <span className="block text-sm">{text(p).name}</span>
                                <span className="block text-xs text-mist">{text(p).description}</span>
                                {p.tracking && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-2xs text-warning">
                                    <Lock className="size-3" aria-hidden /> {t.trackingBlocked}
                                  </span>
                                )}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>

                  <label className="flex cursor-pointer gap-3 rounded-field border border-white/10 px-4 py-3">
                    <input type="checkbox" name="declaration" className="mt-0.5 size-4 accent-white" />
                    <span className="text-sm">{t.declaration}</span>
                  </label>
                  {fieldErrors.declaration && <p role="alert" className="-mt-4 text-2xs font-medium text-danger">{fieldErrors.declaration[0]}</p>}

                  <Button type="submit" className="w-full" size="lg" disabled={pending}>
                    {pending && <Spinner />}
                    {pending ? t.submitting : t.submit}
                  </Button>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
