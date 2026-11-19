"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$29 / mo",
    description: "For solo barbers and independent stylists.",
    features: ["1 Facebook Page (Messenger)", "Up to 2 staff members", "500 AI conversations / month", "Email support"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$69 / mo",
    popular: true,
    description: "For growing salons and barbershops.",
    features: ["1 Facebook Page (Messenger)", "Up to 10 staff members", "2,500 AI conversations / month", "Multi-language Derja, Arabic, French & English"],
  },
  {
    id: "business",
    name: "Business",
    price: "$149 / mo",
    description: "For multi-branch teams and busy clinics.",
    features: ["Up to 5 business locations", "Unlimited staff members", "10,000 AI conversations / month", "Priority support"],
  },
];

export function BillingPlans({ currentPlan }: { currentPlan: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {selected && (
        <Alert tone="info" title={`Upgrade to ${selected.charAt(0).toUpperCase() + selected.slice(1)}`}>
          Online card checkout (Stripe / local payment gateway) is not enabled in this MVP yet. Contact support or connect your billing provider webhook to activate paid plans automatically.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id;
          return (
            <Card key={plan.id} className={cn("flex flex-col p-6", plan.popular && "border-brand-500 ring-1 ring-brand-500")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">{plan.name}</h3>
                {isCurrent ? <Badge tone="green">Current plan</Badge> : plan.popular ? <Badge tone="violet">Most popular</Badge> : null}
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{plan.price}</p>
              <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-700">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Button
                  type="button"
                  variant={isCurrent ? "secondary" : plan.popular ? "primary" : "secondary"}
                  className="w-full"
                  disabled={isCurrent}
                  onClick={() => setSelected(plan.id)}
                >
                  {isCurrent ? "Active plan" : `Select ${plan.name}`}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
