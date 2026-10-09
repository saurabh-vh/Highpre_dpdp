import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { appLabel } from "@/lib/agent/catalog";
import { popularUnapproved, type AiToolTotal } from "@/lib/agent/usage";

/**
 * "AI tools your team uses": how many people used each tool in the last 30
 * days. Company totals only, with no names and no way to drill into a person.
 */
export function AiToolsCard({ tools, people, allowed, enabled }: { tools: AiToolTotal[]; people: number; allowed: readonly string[]; enabled: boolean }) {
  const top = tools[0]?.people ?? 0;
  const nudge = popularUnapproved(tools, people, allowed);
  return (
    <Panel>
      <PanelHeader title="AI tools your team uses" description="Last 30 days. Company totals only. HighPre never sees what anyone types." />
      {!enabled ? (
        <PanelBody>
          <p className="text-xs text-mist">Turned off. You can turn it on under &ldquo;What to look for&rdquo; below.</p>
        </PanelBody>
      ) : tools.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing yet" description="Totals appear here a day after HighPre sees an AI tool on a computer or browser." />
      ) : (
        <PanelBody className="space-y-4">
          <ul className="space-y-2.5">
            {tools.map((t) => {
              const approved = allowed.includes(t.app);
              return (
                <li key={t.app} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_auto]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{appLabel(t.app)}</span>
                    {approved && <Badge tone="success">Approved</Badge>}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden>
                    <span className={approved ? "block h-full rounded-full bg-success/70" : "block h-full rounded-full bg-white/50"} style={{ width: `${Math.max(4, Math.round((t.people / top) * 100))}%` }} />
                  </span>
                  <span className="whitespace-nowrap text-right text-xs text-mist">
                    {t.people} {t.people === 1 ? "person" : "people"}
                  </span>
                </li>
              );
            })}
          </ul>
          {nudge && (
            <p className="text-xs text-mist">
              {appLabel(nudge.app)} is popular with your team. Consider a company plan or add it to Allowed tools.
            </p>
          )}
        </PanelBody>
      )}
    </Panel>
  );
}
