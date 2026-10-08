"use client";

import { useEffect, useRef } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { DPA_STATUSES, VENDOR_CATEGORIES } from "@/lib/vendors/constants";
import { saveVendorAction } from "./actions";

export type VendorValues = {
  id: string;
  name: string;
  category: string;
  website: string;
  processingCountry: string;
  dataShared: string;
  dpaStatus: string;
  /** "YYYY-MM-DD" for the date inputs. */
  dpaSignedAt: string;
  dpaRenewalAt: string;
  contactEmail: string;
  notes: string;
};

/** Add a vendor, or edit one's details and DPA status. */
export function VendorForm({ vendor }: { vendor?: VendorValues }) {
  const { state, pending, formProps } = useActionForm(saveVendorAction.bind(null, vendor?.id ?? ""));
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.ok && !vendor) formRef.current?.reset();
  }, [state, vendor]);

  return (
    <form ref={formRef} {...formProps} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Vendor" name="name" errors={e.name}>
          <Input defaultValue={vendor?.name} placeholder="Razorpay" />
        </Field>
        <Field label="Category" name="category" errors={e.category}>
          <Select defaultValue={vendor?.category ?? "other"}>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Website" name="website" errors={e.website}>
          <Input defaultValue={vendor?.website} placeholder="razorpay.com" inputMode="url" />
        </Field>
        <Field label="Where data is processed" name="processingCountry" errors={e.processingCountry} hint="Country, e.g. India or United States.">
          <Input defaultValue={vendor?.processingCountry} placeholder="India" />
        </Field>
      </div>
      <Field label="Personal data shared" name="dataShared" errors={e.dataShared}>
        <Input defaultValue={vendor?.dataShared} placeholder="Name, email, phone, payment details" />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Processing agreement (DPA)" name="dpaStatus" errors={e.dpaStatus}>
          <Select defaultValue={vendor?.dpaStatus ?? "not_started"}>
            {DPA_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Signed on" name="dpaSignedAt" errors={e.dpaSignedAt}>
          <Input type="date" defaultValue={vendor?.dpaSignedAt} />
        </Field>
        <Field label="Renewal or review date" name="dpaRenewalAt" errors={e.dpaRenewalAt} hint="Optional. Owners and admins get a reminder 14 days before.">
          <Input type="date" defaultValue={vendor?.dpaRenewalAt} />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-[1fr_2fr]">
        <Field label="Privacy or DPA contact" name="contactEmail" errors={e.contactEmail}>
          <Input type="email" defaultValue={vendor?.contactEmail} placeholder="privacy@vendor.com" />
        </Field>
        <Field label="Notes" name="notes" errors={e.notes} hint="Internal only. Where the signed copy is kept, what's pending.">
          <Textarea rows={2} defaultValue={vendor?.notes} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingLabel="Saving">
          {vendor ? "Save vendor" : "Add vendor"}
        </SubmitButton>
      </div>
    </form>
  );
}
