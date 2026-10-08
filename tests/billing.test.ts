import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { effectivePlan, getPlan } from "@/lib/billing/plans";
import { planFromRazorpay, razorpayPlanId, verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/billing/razorpay";
import { monthStartIst, seatLimitReached, siteLimitReached } from "@/lib/billing/usage";

describe("effectivePlan", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);

  it("keeps paid features while the subscription is live", () => {
    for (const status of ["active", "authenticated", "pending"]) {
      expect(effectivePlan({ plan: "starter", billing: { status } }).id).toBe("starter");
    }
  });

  it("keeps a cancelled plan until the paid period ends", () => {
    expect(effectivePlan({ plan: "growth", billing: { status: "cancelled", currentPeriodEnd: future } }).id).toBe("growth");
    expect(effectivePlan({ plan: "growth", billing: { status: "cancelled", currentPeriodEnd: past } }).id).toBe("free");
  });

  it("drops to Free when payments fail", () => {
    expect(effectivePlan({ plan: "starter", billing: { status: "halted" } }).id).toBe("free");
  });

  it("honours a plan granted without a subscription", () => {
    expect(effectivePlan({ plan: "growth", billing: { status: "none" } }).id).toBe("growth");
    expect(effectivePlan({ plan: "growth" }).id).toBe("growth");
  });
});

describe("limits", () => {
  it("blocks at the limit, not before", () => {
    const free = getPlan("free");
    expect(siteLimitReached(free, 0)).toBeNull();
    expect(siteLimitReached(free, 1)).toMatch(/Upgrade/);
    expect(seatLimitReached(getPlan("free"), 2)).toBeNull();
    expect(seatLimitReached(getPlan("free"), 3)).toMatch(/Upgrade/);
  });

  it("counts months in India time", () => {
    // 31 Jan 20:00 UTC is already 1 Feb in India.
    expect(monthStartIst(new Date("2026-01-31T20:00:00Z")).toISOString()).toBe("2026-01-31T18:30:00.000Z");
    expect(monthStartIst(new Date("2026-01-15T12:00:00Z")).toISOString()).toBe("2025-12-31T18:30:00.000Z");
  });
});

describe("Razorpay", () => {
  it("maps plan IDs both ways", () => {
    expect(razorpayPlanId("starter")).toBe("plan_starter");
    expect(planFromRazorpay("plan_growth")).toBe("growth");
    expect(planFromRazorpay("plan_other")).toBeNull();
    expect(razorpayPlanId("free")).toBeNull();
  });

  it("verifies the checkout signature", () => {
    const sig = createHmac("sha256", "rzp_test_secret").update("pay_1|sub_1").digest("hex");
    expect(verifyCheckoutSignature("pay_1", "sub_1", sig)).toBe(true);
    expect(verifyCheckoutSignature("pay_2", "sub_1", sig)).toBe(false);
    expect(verifyCheckoutSignature("pay_1", "sub_1", "short")).toBe(false);
  });

  it("verifies webhook signatures over the raw body", () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    const sig = createHmac("sha256", "whsec_test").update(body).digest("hex");
    expect(verifyWebhookSignature(body, sig)).toBe(true);
    expect(verifyWebhookSignature(body + " ", sig)).toBe(false);
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });
});
