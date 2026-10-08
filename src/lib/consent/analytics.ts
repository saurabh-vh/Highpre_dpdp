import "server-only";
import type { Types } from "mongoose";
import { languageLabel } from "@/lib/i18n/languages";
import { ConsentRecord, Site } from "@/models";

/**
 * Consent analytics over the ledger.
 *
 * What is counted: decision events, one per ledger record. The widget writes a
 * record every time a visitor makes or changes a choice (and the parental page
 * writes one when a parent approves), so a visitor who changes their mind is
 * counted twice. These are not unique visitors.
 *
 * Records don't say which button was pressed, so each one is classified from
 * its contents, ignoring essential (always-on) purposes:
 * - withdrawn: action "withdraw" (a previously granted purpose was turned off)
 * - accept all: every optional purpose granted (including "choose" with all ticked)
 * - reject all: no optional purpose granted (includes under-18s held on essentials)
 * - customised: some but not all optional purposes granted
 *
 * Days are Asia/Kolkata calendar days. The current period is the last N days
 * including today; the previous period is the N days before it. Only counts
 * and rates leave this module, never visitor ids or IP hashes.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];
export const pickRange = (value: unknown): RangeDays => RANGES.find((r) => String(r) === value) ?? 30;

export const KINDS = ["accept", "reject", "custom", "withdraw"] as const;
export type DecisionKind = (typeof KINDS)[number];
export type DecisionMix = Record<DecisionKind, number>;

export type DayPoint = DecisionMix & { day: string; total: number };
export type PurposeRate = { key: string; name: string; granted: number; total: number; rate: number };
export type LanguageRow = { code: string; label: string; total: number; accepted: number; rate: number };

export type ConsentAnalytics = {
  days: RangeDays;
  from: Date;
  to: Date;
  total: number;
  mix: DecisionMix;
  previous: { total: number; mix: DecisionMix };
  purposes: PurposeRate[];
  languages: LanguageRow[];
  series: DayPoint[];
  sites: { siteId: string; name: string; total: number }[];
};

type SiteLike = { _id: Types.ObjectId; name: string; purposes: { key: string; name: string; essential?: boolean | null }[] };

const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const istDay = (d: Date) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const emptyMix = (): DecisionMix => ({ accept: 0, reject: 0, custom: 0, withdraw: 0 });

/** Share of `n` in `total`, 0 when there's nothing to divide. */
export const rate = (n: number, total: number) => (total > 0 ? n / total : 0);
export const percent = (r: number) => `${Math.round(r * 100)}%`;

/** Midnight IST at the start of the first day of an N-day window ending today. */
export function periodStart(days: number, now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS - (days - 1) * DAY_MS);
}

type Facets = {
  mix: { _id: { prev: boolean; kind: DecisionKind }; n: number }[];
  series: { _id: { day: string; kind: DecisionKind }; n: number }[];
  languages: { _id: string | null; n: number; accepted: number }[];
  purposes: { _id: string; n: number; granted: number }[];
  sites: { _id: Types.ObjectId; n: number }[];
};

/** Analytics for a set of sites: pass one site, or use orgConsentAnalytics for all of them. */
export async function consentAnalytics(sites: SiteLike[], days: RangeDays, now = new Date()): Promise<ConsentAnalytics> {
  const from = periodStart(days, now);
  const prevFrom = new Date(from.getTime() - days * DAY_MS);
  // "siteId:key" for each essential purpose, so one pipeline handles sites with different purposes.
  const essential = sites.flatMap((s) => s.purposes.filter((p) => p.essential).map((p) => `${s._id}:${p.key}`));

  const [facets] = sites.length
    ? await ConsentRecord.aggregate<Facets>([
        // Served by the { siteId, createdAt } index.
        { $match: { siteId: { $in: sites.map((s) => s._id) }, createdAt: { $gte: prevFrom, $lte: now } } },
        {
          $project: {
            siteId: 1,
            language: 1,
            createdAt: 1,
            action: 1,
            prev: { $lt: ["$createdAt", from] },
            optional: {
              $filter: {
                input: "$decisions",
                as: "d",
                cond: { $not: [{ $in: [{ $concat: [{ $toString: "$siteId" }, ":", "$$d.purpose"] }, essential] }] },
              },
            },
          },
        },
        {
          $addFields: {
            kind: {
              $switch: {
                branches: [
                  { case: { $eq: ["$action", "withdraw"] }, then: "withdraw" },
                  { case: { $allElementsTrue: ["$optional.granted"] }, then: "accept" },
                  { case: { $not: [{ $anyElementTrue: ["$optional.granted"] }] }, then: "reject" },
                ],
                default: "custom",
              },
            },
          },
        },
        {
          $facet: {
            mix: [{ $group: { _id: { prev: "$prev", kind: "$kind" }, n: { $sum: 1 } } }],
            series: [
              { $match: { prev: false } },
              { $group: { _id: { day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Kolkata" } }, kind: "$kind" }, n: { $sum: 1 } } },
            ],
            languages: [
              { $match: { prev: false } },
              { $group: { _id: "$language", n: { $sum: 1 }, accepted: { $sum: { $cond: [{ $eq: ["$kind", "accept"] }, 1, 0] } } } },
            ],
            purposes: [
              { $match: { prev: false } },
              { $unwind: "$optional" },
              { $group: { _id: "$optional.purpose", n: { $sum: 1 }, granted: { $sum: { $cond: ["$optional.granted", 1, 0] } } } },
            ],
            sites: [{ $match: { prev: false } }, { $group: { _id: "$siteId", n: { $sum: 1 } } }],
          },
        },
      ])
    : [{ mix: [], series: [], languages: [], purposes: [], sites: [] } satisfies Facets];

  const mix = emptyMix();
  const prevMix = emptyMix();
  for (const m of facets.mix) (m._id.prev ? prevMix : mix)[m._id.kind] += m.n;
  const sum = (x: DecisionMix) => KINDS.reduce((s, k) => s + x[k], 0);
  const total = sum(mix);

  // Zero-filled, one point per IST day.
  const byDay = new Map<string, DayPoint>();
  for (let i = 0; i < days; i++) {
    const day = istDay(new Date(from.getTime() + i * DAY_MS));
    byDay.set(day, { day, total: 0, ...emptyMix() });
  }
  for (const s of facets.series) {
    const point = byDay.get(s._id.day);
    if (!point) continue;
    point[s._id.kind] += s.n;
    point.total += s.n;
  }

  // A purpose key shared by several sites is reported once, named after the first site that has it.
  const purposeName = new Map<string, string>();
  for (const s of sites) for (const p of s.purposes) if (!purposeName.has(p.key)) purposeName.set(p.key, p.name);
  const purposes = facets.purposes
    .map((p) => ({ key: p._id, name: purposeName.get(p._id) ?? p._id, granted: p.granted, total: p.n, rate: rate(p.granted, p.n) }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));

  const languages = facets.languages
    .map((l) => ({ code: l._id ?? "en", label: languageLabel(l._id ?? "en"), total: l.n, accepted: l.accepted, rate: rate(l.accepted, l.n) }))
    .sort((a, b) => b.total - a.total);

  const siteName = new Map(sites.map((s) => [String(s._id), s.name]));
  const siteRows = facets.sites
    .map((s) => ({ siteId: String(s._id), name: siteName.get(String(s._id)) ?? "", total: s.n }))
    .sort((a, b) => b.total - a.total);

  return {
    days,
    from,
    to: now,
    total,
    mix,
    previous: { total: sum(prevMix), mix: prevMix },
    purposes,
    languages,
    series: [...byDay.values()],
    sites: siteRows,
  };
}

/** Analytics across every site in an organisation. */
export async function orgConsentAnalytics(orgId: Types.ObjectId, days: RangeDays, now = new Date()) {
  const sites = await Site.find({ orgId }).select("name purposes.key purposes.name purposes.essential").lean();
  return consentAnalytics(sites, days, now);
}
