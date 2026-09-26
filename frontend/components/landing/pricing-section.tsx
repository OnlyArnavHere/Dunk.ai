"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    description: "For individuals and small projects",
    price: { monthly: 0, annual: 0 },
    features: [
      "Up to 3 projects",
      "1GB storage",
      "Community support",
      "Basic analytics",
      "SSL certificates",
    ],
    cta: "Start free",
    popular: false,
    colorScheme: "cyan",
  },
  {
    name: "Pro",
    description: "For growing teams and businesses",
    price: { monthly: 29, annual: 24 },
    features: [
      "Unlimited projects",
      "100GB storage",
      "Priority support",
      "Advanced analytics",
      "Custom domains",
      "Team collaboration",
      "API access",
    ],
    cta: "Start trial",
    popular: true,
    colorScheme: "emerald",
  },
  {
    name: "Enterprise",
    description: "For large-scale operations",
    price: { monthly: null, annual: null },
    features: [
      "Everything in Pro",
      "Unlimited storage",
      "24/7 dedicated support",
      "Custom integrations",
      "SLA guarantee",
      "On-premise option",
      "Security audit",
      "Custom contracts",
    ],
    cta: "Contact sales",
    popular: false,
    colorScheme: "violet",
  },
];

export function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="pricing" ref={sectionRef} className="relative py-32 lg:py-48 bg-[#050608]">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 mb-24 lg:mb-32">
          <div className="flex-1 max-w-xl">
            <h2 className={`text-5xl lg:text-7xl font-light tracking-[-0.02em] text-white transition-all duration-1000 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              Transparent
              <br />
              <span className="font-serif italic text-white/50">pricing.</span>
            </h2>
            <p className={`mt-8 text-xl text-white/50 font-light transition-all duration-1000 delay-200 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
              Start free and scale as you grow. No hidden fees, no surprises.
            </p>
          </div>

          <div className={`flex-1 flex items-end justify-start lg:justify-end transition-all duration-1000 delay-300 ease-out ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}>
            <div className="flex items-center gap-4 p-2 rounded-full border border-white/10 bg-white/[0.02] backdrop-blur-sm">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  !isAnnual ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  isAnnual ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white"
                }`}
              >
                Annual <span className={isAnnual ? "text-emerald-500/70" : "text-white/30"}>(-17%)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Pricing Layout */}
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Starter */}
          <div className={`col-span-12 lg:col-span-4 transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <PricingCard plan={plans[0]} isAnnual={isAnnual} />
          </div>

          {/* Pro (Emphasized) */}
          <div className={`col-span-12 lg:col-span-4 lg:-my-8 relative z-10 transition-all duration-1000 delay-400 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/20 to-transparent blur-3xl opacity-40" />
            <PricingCard plan={plans[1]} isAnnual={isAnnual} emphasized />
          </div>

          {/* Enterprise */}
          <div className={`col-span-12 lg:col-span-4 transition-all duration-1000 delay-600 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"}`}>
            <PricingCard plan={plans[2]} isAnnual={isAnnual} />
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingCard({ plan, isAnnual, emphasized = false }: { plan: any, isAnnual: boolean, emphasized?: boolean }) {
  const getCardStyle = () => {
    if (emphasized) return "bg-gradient-to-b from-[#091a13] to-[#040907] border-emerald-500/30 shadow-[0_0_40px_rgba(16,185,129,0.15)]";
    if (plan.colorScheme === "cyan") return "bg-transparent border-cyan-500/10 hover:border-cyan-500/30 hover:bg-cyan-950/20";
    return "bg-transparent border-violet-500/10 hover:border-violet-500/30 hover:bg-violet-950/20";
  };

  const getCheckColor = () => {
    if (emphasized) return "text-emerald-400";
    if (plan.colorScheme === "cyan") return "text-cyan-400";
    return "text-violet-400";
  };

  const getButtonClass = () => {
    if (emphasized) return "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white hover:from-emerald-400 hover:to-cyan-400 border-none shadow-[0_0_20px_rgba(16,185,129,0.2)]";
    if (plan.colorScheme === "cyan") return "border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10";
    return "border-violet-500/30 text-violet-400 hover:bg-violet-500/10";
  };

  return (
    <div className={`relative p-10 lg:p-12 rounded-3xl flex flex-col h-full transition-colors ${getCardStyle()}`}>
      {emphasized && (
        <div className="absolute -top-4 left-10">
          <span className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-mono uppercase tracking-widest rounded-full shadow-lg border border-emerald-400/50">
            Most Popular
          </span>
        </div>
      )}

      <div className="mb-10">
        <h3 className="text-3xl font-light tracking-tight text-white mb-3">{plan.name}</h3>
        <p className="text-white/40 font-light text-sm">{plan.description}</p>
      </div>

      <div className="mb-12">
        {plan.price.monthly !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-light text-white tracking-tighter">
              ${isAnnual ? plan.price.annual : plan.price.monthly}
            </span>
            <span className="text-white/30 font-light">/mo</span>
          </div>
        ) : (
          <span className="text-5xl font-light text-white tracking-tighter">Custom</span>
        )}
      </div>

      <ul className="space-y-4 mb-16 flex-1">
        {plan.features.map((feature: string) => (
          <li key={feature} className="flex items-start gap-4">
            <Check className={`w-5 h-5 shrink-0 mt-0.5 ${getCheckColor()}`} />
            <span className="text-white/70 font-light text-sm">{feature}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className={`w-full py-4 px-6 flex items-center justify-center gap-2 text-sm font-medium transition-all rounded-full group border ${getButtonClass()}`}
      >
        {plan.cta}
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </button>
    </div>
  );
}
