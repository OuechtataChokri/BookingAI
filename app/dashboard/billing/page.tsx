import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getSubscription } from "@/lib/data/queries";
import { Card, CardHeader, PageHeader, StatusBadge } from "@/components/ui";
import { daysUntil, formatDate } from "@/lib/utils";
import { BillingPlans } from "./billing-plans";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage() {
  const ctx = await getAppContext();
  const sub = await getSubscription(ctx);
  const plan = sub?.plan ?? "trial";
  const status = sub?.status ?? "trialing";
  const trialDaysLeft = sub?.trial_ends_at ? daysUntil(sub.trial_ends_at) : null;

  return (
    <>
      <PageHeader title="Billing" description="Your subscription plan and trial status." />

      <div className="space-y-6">
        <Card>
          <CardHeader title="Current subscription" action={<StatusBadge status={status} />} />
          <div className="flex flex-wrap items-center gap-6 p-5">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <CreditCard className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-base font-semibold capitalize text-slate-900">{plan} plan</p>
              <p className="text-sm text-slate-500">
                {status === "trialing" && trialDaysLeft !== null
                  ? `${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left in your free trial`
                  : sub?.current_period_end
                    ? `Renews on ${formatDate(sub.current_period_end, ctx.business.timezone)}`
                    : "Manage your BookAI subscription."}
              </p>
            </div>
          </div>
        </Card>

        <BillingPlans currentPlan={plan} />
      </div>
    </>
  );
}
