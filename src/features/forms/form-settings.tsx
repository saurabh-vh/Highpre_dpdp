"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { saveFormSettingsAction } from "./actions";

type Purpose = { key: string; name: string; essential: boolean; tracking: boolean };

/** Purposes shown on the website's forms, which must be ticked, and automatic protection. */
export function FormSettings({
  siteId,
  purposes,
  settings,
  readOnly,
}: {
  siteId: string;
  purposes: Purpose[];
  settings: { autoProtect: boolean; purposes: string[]; requiredPurposes: string[] };
  readOnly: boolean;
}) {
  const { state, pending, formProps } = useActionForm(saveFormSettingsAction.bind(null, siteId));

  return (
    <form {...formProps} className="space-y-5">
      <fieldset disabled={readOnly} className="space-y-5">
        <Switch
          name="autoProtect"
          label="Protect forms automatically"
          description="Adds the checkboxes below to every form that asks for an email address, phone number or name, even without the attribute. Search, login and password forms are left alone."
          defaultChecked={settings.autoProtect}
          disabled={readOnly}
        />
        {purposes.length === 0 ? (
          <p className="text-xs text-mist">Add purposes to your data inventory first.</p>
        ) : (
          <div className="overflow-x-auto rounded-field border border-line">
            <table className="data-table">
              <caption className="sr-only">Purposes on forms</caption>
              <thead>
                <tr>
                  <th scope="col">Purpose</th>
                  <th scope="col">Show on forms</th>
                  <th scope="col">Must be ticked</th>
                </tr>
              </thead>
              <tbody>
                {purposes.map((p) => (
                  <tr key={p.key}>
                    <td>
                      <span className="block text-sm">{p.name}</span>
                      <code className="font-mono text-2xs text-mist">{p.key}</code>
                      {p.tracking && <span className="ml-2 text-2xs text-warning">Tracking: keep it optional</span>}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        name="purposes"
                        value={p.key}
                        defaultChecked={settings.purposes.includes(p.key)}
                        aria-label={`Show ${p.name} on forms`}
                        className="size-4 accent-white"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        name="requiredPurposes"
                        value={p.key}
                        defaultChecked={settings.requiredPurposes.includes(p.key)}
                        aria-label={`${p.name} must be ticked`}
                        className="size-4 accent-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-2xs text-mist">
          Only make a box required when the form can&apos;t work without that use of the data, such as replying to an enquiry. Consent to marketing must stay optional.
        </p>
      </fieldset>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
          <FormMessage state={state} className="mr-auto" />
          <SubmitButton pending={pending} pendingLabel="Saving">Save form settings</SubmitButton>
        </div>
      )}
    </form>
  );
}
