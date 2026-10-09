import { BellRing, Laptop, LockKeyhole, TriangleAlert } from "lucide-react";
import { AgentHowItWorksIllustration, CompanyInstallIllustration, ExtensionIllustration } from "@/components/illustrations/feature-illustrations";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { AgentDownloads, CompanyInstall } from "@/features/agent/agent-controls";
import { getAgentPolicy } from "@/lib/agent/policy";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Desktop agent" };

const STEPS = [
  { icon: TriangleAlert, title: "Warns on screen", text: "If someone copies a password or card number while an AI or chat app is open." },
  { icon: BellRing, title: "Tells the owner", text: "Who, which app and what kind of data. You get an email too." },
  { icon: LockKeyhole, title: "Private data stays private", text: "What they copied never leaves their computer. HighPre never sees it." },
];

/** Get started: how it works and the downloads. Alerts, computers and settings have their own tabs. */
export default async function AgentGetStartedPage() {
  const { org, role } = await requireAuth();
  const manager = can(role, "team");
  const policy = manager ? await getAgentPolicy(org._id) : null;

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="How it works" />
        <PanelBody className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          <AgentHowItWorksIllustration />
          <ol className="space-y-4">
            {STEPS.map((step) => (
              <li key={step.title} className="flex gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                  <step.icon className="size-4 text-fog" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{step.title}</span>
                  <span className="block text-xs text-mist">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Install" description="Download it on your computer. Each copy is linked to you." />
        <PanelBody className="space-y-5">
          <AgentDownloads />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 rounded-field border border-line p-4">
              <ExtensionIllustration className="w-40 shrink-0 border-0 bg-transparent p-0" />
              <p className="text-xs text-mist">
                <span className="block text-sm font-medium text-paper">Browser extension</span>
                Catches pasting, typing and file uploads in ChatGPT, Gemini, WhatsApp Web and more.
              </p>
            </div>
            <div className="flex items-center gap-4 rounded-field border border-line p-4">
              <Laptop className="size-8 shrink-0 text-fog" aria-hidden />
              <p className="text-xs text-mist">
                <span className="block text-sm font-medium text-paper">Desktop app</span>
                Also covers the ChatGPT, WhatsApp and Slack apps. Use both for the best protection.
              </p>
            </div>
          </div>
          <Callout tone="info">Tell your team before they install it. On a Mac, right-click the installer and choose Open the first time.</Callout>
        </PanelBody>
      </Panel>

      {manager && policy && (
        <Panel>
          <PanelHeader title="Install on all company computers" description="For IT teams. Send one installer to every computer with Intune, Jamf or similar." />
          <PanelBody className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <CompanyInstall enabled={policy.enrollmentEnabled} />
              <p className="mt-4 text-2xs text-mist">Steps are inside the download. Keep the installer inside your company; if it leaks, click Replace key.</p>
            </div>
            <CompanyInstallIllustration className="md:w-60" />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
