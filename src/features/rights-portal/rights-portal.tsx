"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { LanguagePicker } from "@/components/consent/language-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { REQUEST_TYPES } from "@/lib/constants";
import { getLocale, languageOf } from "@/lib/i18n";

type Errors = Record<string, string[] | undefined>;

export async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Two-step public request form: verify email with a code, then file the request. */
export function RightsPortal({ siteKey, businessName, languages, initialLang }: { siteKey: string; businessName: string; languages: string[]; initialLang: string }) {
  const [lang, setLang] = useState(initialLang);
  const [step, setStep] = useState<"email" | "details" | "done">("email");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ reference: string; dueAt: string } | null>(null);
  const locale = getLocale(lang);
  const t = locale.portal;

  async function requestCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { ok, data } = await postJson("/api/public/rights/otp", { siteKey, email, purpose: "rights" });
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
    const { ok, data } = await postJson("/api/public/rights/submit", { ...Object.fromEntries(form), siteKey, email, language: lang });
    setPending(false);
    if (!ok) {
      setError(data.error ?? t.genericError);
      setFieldErrors(data.fieldErrors ?? {});
      return;
    }
    setResult({ reference: data.reference, dueAt: data.dueAt });
    setStep("done");
  }

  const dueText = result ? new Intl.DateTimeFormat(languageOf(lang).intl, { dateStyle: "long" }).format(new Date(result.dueAt)) : "";

  return (
    <div lang={lang}>
      <LanguagePicker languages={languages} value={lang} onChange={setLang} />

      {step === "done" && result ? (
        <div className="animate-rise-in">
          <CheckCircle2 className="mb-6 size-10 text-success" strokeWidth={1.4} aria-hidden />
          <h1 className="text-2xl font-semibold">{t.doneTitle}</h1>
          <p className="mt-4 text-sm leading-relaxed text-fog">{t.done(result.reference, dueText)}</p>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-balance">{t.title(businessName)}</h1>
          <p className="mt-3 text-sm leading-relaxed text-mist">{t.intro}</p>

          <div className="mt-10 rounded-panel border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            {error && <FormMessage state={{ ok: false, message: error }} className="mb-6" />}

            {step === "email" ? (
              <form onSubmit={requestCode} className="space-y-5">
                <Field label={t.email} name="email">
                  <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" className="w-full" size="lg" disabled={pending || !email}>
                  {pending && <Spinner />}
                  {pending ? t.sending : t.sendCode}
                </Button>
              </form>
            ) : (
              <form onSubmit={submit} className="space-y-5" noValidate>
                <p className="text-xs text-fog">
                  {t.codeSent(email)}{" "}
                  <button type="button" onClick={() => setStep("email")} className="underline underline-offset-4">
                    {t.changeEmail}
                  </button>
                </p>
                <Field label={t.code} name="code" errors={fieldErrors.code}>
                  <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="font-mono tracking-[0.4em]" required autoFocus />
                </Field>
                <Field label={t.type} name="type" errors={fieldErrors.type}>
                  <Select defaultValue="access">
                    {REQUEST_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {locale.requestTypes[o.value]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t.name} name="name" errors={fieldErrors.name}>
                    <Input autoComplete="name" required />
                  </Field>
                  <Field label={t.phone} name="phone" errors={fieldErrors.phone}>
                    <Input type="tel" autoComplete="tel" />
                  </Field>
                </div>
                <Field label={t.details} name="details" errors={fieldErrors.details} hint={t.detailsHint}>
                  <Textarea rows={4} />
                </Field>
                <Button type="submit" className="w-full" size="lg" disabled={pending}>
                  {pending && <Spinner />}
                  {pending ? t.submitting : t.submit}
                </Button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
