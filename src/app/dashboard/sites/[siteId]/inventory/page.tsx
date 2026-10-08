import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { AddPresetButton, DeletePurposeButton } from "@/features/inventory/purpose-actions";
import { PurposeForm } from "@/features/inventory/purpose-form";
import { requireSite } from "@/lib/auth/guards";
import { PURPOSE_PRESETS, dataCategoryLabel, isTracking } from "@/lib/constants";
import { normalizeLanguages } from "@/lib/i18n/languages";
import { retentionText } from "@/lib/notice/generate";
import { Scan } from "@/models";

export const metadata = { title: "Data inventory" };

export default async function InventoryPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await requireSite(siteId);
  const scan = site.lastScanId ? await Scan.findById(site.lastScanId).lean() : null;

  // Suggest presets the scan gives evidence for and that aren't listed yet.
  const existing = new Set(site.purposes.map((p) => p.key));
  const categories = new Set(scan?.trackers.map((t) => t.category));
  const evidence: Record<string, boolean> = {
    enquiries: (scan?.forms.length ?? 0) > 0,
    analytics: categories.has("analytics") || categories.has("session_recording"),
    marketing: categories.has("marketing"),
  };
  const suggestions = PURPOSE_PRESETS.filter((p) => evidence[p.key] && !existing.has(p.key));
  const languages = normalizeLanguages(site.languages);

  return (
    <div className="space-y-6">
      {suggestions.length > 0 && (
        <Panel>
          <PanelHeader title="Suggested from your scan" description="Your website appears to do these. Add them, then adjust the wording to match what you actually do." />
          <PanelBody className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <AddPresetButton key={s.key} siteId={site.id} presetKey={s.key} label={s.name} />
            ))}
          </PanelBody>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Why you collect personal data"
          description="Each purpose becomes a line in your privacy notice and a choice in your consent banner."
        />
        {site.purposes.length === 0 ? (
          <PanelBody>
            <p className="text-sm text-mist">No purposes yet. Add your first one below.</p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-white/[0.08]">
            {site.purposes.map((p) => (
              <li key={p.key}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-6 py-5 transition-colors hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-mist">
                        {p.dataCategories.map(dataCategoryLabel).join(", ")}. Kept up to {retentionText(p.retentionDays, "en")}.
                      </span>
                    </span>
                    {isTracking(p) && <Badge tone="warning">Tracking</Badge>}
                    {p.essential ? <Badge tone="outline">Essential</Badge> : <Badge tone="info">Needs consent</Badge>}
                    <span className="text-xs text-mist group-open:hidden">Edit</span>
                    <span className="hidden text-xs text-mist group-open:inline">Close</span>
                  </summary>
                  <div className="border-t border-line bg-black/30 px-6 py-6">
                    <PurposeForm siteId={site.id} languages={languages} purpose={{ ...p, tracking: isTracking(p), dataCategories: [...p.dataCategories], translations: p.translations?.map((t) => ({ lang: t.lang, name: t.name, description: t.description })) }} />
                    <div className="mt-4 flex justify-end">
                      <DeletePurposeButton siteId={site.id} purposeKey={p.key} name={p.name} />
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Add a purpose" />
        <PanelBody>
          <PurposeForm siteId={site.id} languages={languages} />
        </PanelBody>
      </Panel>
    </div>
  );
}
