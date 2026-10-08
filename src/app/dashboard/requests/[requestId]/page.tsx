import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { RequestUpdateForm } from "@/features/requests/request-update-form";
import { requireAuth } from "@/lib/auth/guards";
import { requestStatusLabel, requestTypeLabel } from "@/lib/constants";
import { formatDate, formatDateTime, relativeDays } from "@/lib/format";
import { languageLabel } from "@/lib/i18n/languages";
import { RightsRequest, Site, User } from "@/models";

export const metadata = { title: "Data request" };

export default async function RequestDetailPage({ params }: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await params;
  const { org } = await requireAuth();
  if (!Types.ObjectId.isValid(requestId)) notFound();
  const request = await RightsRequest.findOne({ _id: requestId, orgId: org._id }).lean();
  if (!request) notFound();

  const userIds = request.activity.map((a) => a.byUserId).filter(Boolean);
  const [site, users] = await Promise.all([
    Site.findById(request.siteId).select("name").lean(),
    User.find({ _id: { $in: userIds } }).select("name").lean(),
  ]);
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const active = request.status === "open" || request.status === "in_progress";

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/requests", label: "Data requests" }}
        eyebrow={<span className="font-mono">{request.reference}</span>}
        title={requestTypeLabel(request.type)}
        actions={
          <Badge tone={!active ? (request.status === "resolved" ? "success" : "muted") : request.dueAt < new Date() ? "danger" : "warning"}>
            {active ? `Due ${relativeDays(request.dueAt)}, ${formatDate(request.dueAt)}` : requestStatusLabel(request.status)}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="From the requester" />
            <PanelBody>
              <dl className="grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
                <Detail label="Name" value={request.name} />
                <Detail label="Email" value={`${request.email} (verified)`} />
                <Detail label="Phone" value={request.phone || "Not given"} />
                <Detail label="Website" value={site?.name ?? "Removed"} />
                <Detail label="Received" value={formatDateTime(request.createdAt!)} />
                <Detail label="Language" value={languageLabel(request.language ?? "en")} />
              </dl>
              {request.details && (
                <div className="mt-6 border-t border-line pt-6">
                  <p className="text-xs text-mist">Details</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{request.details}</p>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Activity" description="Your audit trail for this request." />
            <ol className="divide-y divide-white/[0.08]">
              {[...request.activity].reverse().map((a, i) => (
                <li key={i} className="px-6 py-4">
                  <p className="text-sm">{a.text}</p>
                  <p className="mt-1 text-2xs text-mist">
                    {a.byUserId ? userName.get(String(a.byUserId)) ?? "Team member" : "HighPre"}, {formatDateTime(a.at!)}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <Panel className="self-start">
          <PanelHeader title="Update" />
          <PanelBody>
            <RequestUpdateForm requestId={String(request._id)} status={request.status} />
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-mist">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}
