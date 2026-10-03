"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, KeyRound } from "lucide-react";
import { PLAN_COPY } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function PricingSection() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="pricing" data-ribbon="pricing" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-muted-foreground">Pricing</p>
          <h2 className="mt-2 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
            Start free. <span className="text-soft">Pay for what we run.</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Plans cover AI that runs on our keys. Anything you run on your own key is free and unlimited, on every plan.
          </p>

          <div role="radiogroup" aria-label="Billing period" className="mx-auto mt-8 inline-flex rounded-full border border-border bg-card p-1">
            {[
              { value: false, label: "Monthly" },
              { value: true, label: "Annual · save 20%" },
            ].map((option) => (
              <button
                key={option.label}
                role="radio"
                aria-checked={annual === option.value}
                onClick={() => setAnnual(option.value)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  annual === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PLAN_COPY.map((plan) => {
            const price = plan.price ? (annual ? plan.price.annual : plan.price.monthly) : null;
            return (
              <div
                key={plan.id}
                className={cn(
                  "shadow-soft relative flex flex-col rounded-[30px] bg-card p-8",
                  plan.highlighted ? "border-2 border-foreground" : "border border-border"
                )}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 left-8 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Most popular
                  </span>
                )}
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

                <div className="mt-6 flex items-baseline gap-1">
                  {price === null ? (
                    <span className="text-4xl font-semibold tracking-tight">Custom</span>
                  ) : (
                    <>
                      <span className="text-5xl font-semibold tracking-tight">${price}</span>
                      <span className="text-muted-foreground">/ month</span>
                    </>
                  )}
                </div>
                <p className="mt-1 h-5 text-xs text-muted-foreground">
                  {price ? (annual ? `Billed $${price * 12} yearly` : "Billed monthly") : price === 0 ? "No card needed" : ""}
                </p>

                <ul className="mt-6 flex-1 space-y-3 text-[15px]">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-3">
                      {feature.includes("own API keys") ? (
                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-2)]" />
                      ) : (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-1)]" />
                      )}
                      {feature}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={cn(
                    "mt-8 inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-medium transition-opacity hover:opacity-90",
                    plan.highlighted ? "bg-primary text-primary-foreground" : "border border-border bg-background"
                  )}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          A <em>hosted AI message</em> is one turn answered on our keys — an interview reply or a pipeline run. Prices in USD.
        </p>
      </div>
    </section>
  );
}
