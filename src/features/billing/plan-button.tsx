"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/action-state";
import type { PlanId } from "@/lib/billing/plans";
import { cancelPlanAction, startCheckoutAction, verifyCheckoutAction } from "./actions";

type RazorpayResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, fn: (e: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/** Upgrade or switch plan: opens Razorpay Checkout, then verifies the payment on the server. */
export function PlanButton({ planId, label, variant = "primary" }: { planId: PlanId; label: string; variant?: "primary" | "outline" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});

  function upgrade() {
    setState({});
    start(async () => {
      const result = await startCheckoutAction(planId);
      if (!result.ok || !result.checkout) {
        setState(result);
        if (result.ok) router.refresh();
        return;
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        setState({ ok: false, message: "Couldn't load the payment window. Check your connection or ad blocker." });
        return;
      }
      const c = result.checkout;
      const rzp = new window.Razorpay({
        key: c.key,
        subscription_id: c.subscriptionId,
        name: "HighPre",
        description: `${c.planName} plan for ${c.orgName}`,
        prefill: { name: c.name, email: c.email },
        theme: { color: "#000000" },
        handler: (res: RazorpayResponse) => {
          start(async () => {
            const verified = await verifyCheckoutAction({
              paymentId: res.razorpay_payment_id,
              subscriptionId: res.razorpay_subscription_id,
              signature: res.razorpay_signature,
            });
            setState(verified);
            router.refresh();
          });
        },
      });
      rzp.on("payment.failed", (e) => setState({ ok: false, message: e.error?.description ?? "The payment didn't go through." }));
      rzp.open();
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={upgrade} disabled={pending} variant={variant} className="w-full">
        {pending && <Spinner />}
        {label}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}

export function CancelPlanButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("Cancel your subscription? You keep your plan until the end of the current billing period.")) return;
          start(async () => {
            setState(await cancelPlanAction());
            router.refresh();
          });
        }}
      >
        {pending && <Spinner />}
        Cancel subscription
      </Button>
      <FormMessage state={state} />
    </div>
  );
}
