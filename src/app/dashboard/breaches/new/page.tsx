import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody } from "@/components/ui/panel";
import { BreachForm } from "@/features/breaches/breach-form";
import { requireAuth } from "@/lib/auth/guards";

export const metadata = { title: "Report a breach" };

export default async function NewBreachPage() {
  await requireAuth();
  return (
    <>
      <PageHeader title="Report a breach" description="Log what you know now. You can add details as you learn more." />
      <Panel className="max-w-3xl">
        <PanelBody>
          <BreachForm />
        </PanelBody>
      </Panel>
    </>
  );
}
