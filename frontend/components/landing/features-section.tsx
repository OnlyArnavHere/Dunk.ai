"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "Natural Language Design",
    description: "Describe your hardware idea in plain English. DunkAI extracts engineering requirements, identifies constraints, and generates complete architectural specifications in minutes.",
    visual: (
      <div className="w-full h-full bg-card border border-border hover:border-cyan-500/40 transition-colors rounded-2xl p-6 lg:p-10 flex flex-col relative overflow-hidden shadow-xl dark:shadow-2xl">
        <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
          <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
          <div className="text-xs font-mono uppercase tracking-widest text-foreground/70 dark:text-cyan-500/70">Requirements Agent</div>
        </div>
        <div className="space-y-4">
          <div className="p-4 bg-secondary dark:bg-cyan-950/20 border border-border dark:border-cyan-500/10 rounded-lg text-sm text-foreground font-mono leading-relaxed shadow-sm">
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">{'>'}</span> <span className="text-foreground/90">Extracting parameters...</span>
            <br />
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">{'>'}</span> <span className="text-foreground/90">Found:</span> <span className="font-semibold text-foreground">Low-power (target: 5 yrs)</span>
            <br />
            <span className="text-cyan-600 dark:text-cyan-400 font-bold">{'>'}</span> <span className="text-foreground/90">Found:</span> <span className="font-semibold text-foreground">WiFi connectivity</span>
            <br />
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{'>'}</span> <span className="font-semibold text-foreground">Constraints mapped.</span>
          </div>
          <div className="h-24 w-full rounded-lg bg-gradient-to-r from-cyan-50 dark:from-cyan-950/30 to-card border border-border dark:border-cyan-500/10 relative overflow-hidden shadow-sm">
             <div className="absolute top-0 left-0 h-full w-[3px] bg-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-[pulse_2s_ease-in-out_infinite]" />
             <div className="p-4 flex gap-4 items-center h-full">
                <div className="w-12 h-12 rounded bg-white dark:bg-cyan-950/50 border border-border dark:border-cyan-500/20 flex items-center justify-center font-serif italic text-cyan-600 dark:text-cyan-400 text-xl shadow-sm">R</div>
                <div className="flex-1 space-y-2">
                  <div className="w-1/3 h-2.5 bg-foreground/20 dark:bg-cyan-500/20 rounded" />
                  <div className="w-1/2 h-2.5 bg-foreground/10 dark:bg-cyan-500/10 rounded" />
                </div>
             </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    number: "02",
    title: "Multi-Agent Engineering",
    description: "Six specialized AI agents handle distinct domains—from architecture and component selection to schematic layout and validation—working in parallel to ensure precision.",
    visual: (
      <div className="w-full h-full flex items-center justify-center p-8 relative">
        <svg viewBox="0 0 200 200" className="w-full h-full max-w-[300px] drop-shadow-xl dark:drop-shadow-[0_0_30px_rgba(139,92,246,0.15)]">
           <circle cx="100" cy="100" r="80" fill="none" className="stroke-border dark:stroke-violet-500/15" strokeWidth="1.5" strokeDasharray="4 6" />
           <circle cx="100" cy="100" r="40" fill="none" className="stroke-foreground/10 dark:stroke-violet-500/20" strokeWidth="1.5" />
           
            {/* Center Agent */}
           <circle cx="100" cy="100" r="22" className="fill-card stroke-border dark:stroke-violet-400/50" strokeWidth="2" />
           <text x="100" y="104" textAnchor="middle" fill="currentColor" className="text-foreground font-mono font-bold" fontSize="9">SYNC</text>

           {/* Orbiting Agents */}
           {[0, 60, 120, 180, 240, 300].map((angle, i) => {
             const rad = (angle * Math.PI) / 180;
             const x = 100 + Math.cos(rad) * 80;
             const y = 100 + Math.sin(rad) * 80;
             const dotColors = ["#8b5cf6", "#10b981", "#3b82f6", "#f59e0b", "#ec4899", "#14b8a6"];
             return (
               <g key={i} className={`origin-[100px_100px] animate-[spin_20s_linear_infinite]`} style={{ animationDelay: `-${i}s` }}>
                 <circle cx={x} cy={y} r="14" className="fill-card stroke-border dark:stroke-violet-500/30 shadow-sm" strokeWidth="1.5" />
                 <path d={`M 100 100 L ${x} ${y}`} className="stroke-border dark:stroke-violet-500/20" strokeWidth="1.5" />
                 <circle cx={x} cy={y} r="3" fill={dotColors[i]} className="drop-shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
               </g>
             );
           })}
        </svg>
      </div>
    ),
  },
  {
    number: "03",
    title: "Component Intelligence",
    description: "The AI automatically selects the optimal bill of materials (BOM), balancing cost, availability, footprint, and performance parameters against your exact requirements.",
    visual: (
      <div className="w-full h-full bg-card border border-border hover:border-emerald-500/40 transition-colors rounded-2xl p-6 shadow-xl dark:shadow-2xl flex flex-col gap-3">
         <div className="text-xs uppercase tracking-widest text-emerald-600 dark:text-emerald-500 mb-2 font-mono font-bold">BOM Optimized</div>
         {[
           { name: "STM32L476RG", type: "MCU", status: "In Stock", color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-transparent" },
           { name: "BME280", type: "Sensor", status: "Validated", color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-transparent" },
           { name: "ESP32-C3", type: "WiFi", status: "In Stock", color: "text-emerald-700 bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-transparent" },
         ].map((comp, i) => (
           <div key={i} className="flex items-center justify-between p-4 bg-secondary/80 dark:bg-secondary/50 rounded-xl border border-border dark:border-emerald-500/10 shadow-sm">
             <div className="flex flex-col gap-1">
               <span className="text-sm text-foreground font-semibold">{comp.name}</span>
               <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{comp.type}</span>
             </div>
             <span className={`text-[10px] px-2.5 py-1 rounded-md font-mono font-semibold border ${comp.color}`}>
               {comp.status}
             </span>
           </div>
         ))}
      </div>
    ),
  },
  {
    number: "04",
    title: "Design Validation",
    description: "Every decision is continuously cross-checked. Electrical rules, thermal limits, and layout constraints are validated before you ever export a file to KiCad.",
    visual: (
      <div className="w-full h-full bg-gradient-to-b from-card to-secondary/30 dark:to-background border border-border dark:border-amber-500/20 hover:border-amber-500/40 transition-colors rounded-2xl p-8 relative overflow-hidden flex flex-col justify-end shadow-xl dark:shadow-2xl">
         <div className="absolute top-8 right-8">
           <div className="w-16 h-16 bg-card rounded-full border border-border flex items-center justify-center relative shadow-sm">
             <div className="w-12 h-12 rounded-full border-t-2 border-r-2 border-emerald-500 animate-spin absolute" />
             <div className="font-serif italic text-emerald-600 dark:text-emerald-400 text-sm font-bold">98%</div>
           </div>
         </div>
         <div className="space-y-4 relative z-10 bg-card/80 dark:bg-transparent backdrop-blur-sm p-4 rounded-xl border border-border dark:border-transparent">
           <div className="flex items-center gap-3 text-sm text-foreground font-medium">
             <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
             ERC Check Passed
           </div>
           <div className="flex items-center gap-3 text-sm text-foreground font-medium">
             <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
             Thermal Limits Verified
           </div>
           <div className="flex items-center gap-3 text-sm text-amber-600 dark:text-amber-500 font-medium">
             <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" />
             DRC Layout (Running...)
           </div>
         </div>
      </div>
    ),
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="relative py-32 lg:py-48 bg-background">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="mb-32 lg:mb-48 max-w-3xl">
          <h2 className="text-5xl lg:text-7xl font-light tracking-[-0.02em] text-foreground">
            From concept to production.
            <br />
            <span className="font-serif italic text-muted-foreground">In days, not months.</span>
          </h2>
        </div>

        <div className="flex flex-col gap-32 lg:gap-48">
          {features.map((feature, index) => (
            <FeatureRow key={feature.number} feature={feature} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureRow({ feature, index }: { feature: typeof features[0], index: number }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  const isEven = index % 2 === 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={ref}
      className={`flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-16 lg:gap-24 transition-all duration-1000 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-16"
      }`}
    >
      <div className="flex-1 w-full relative">
        <div className="font-serif italic text-7xl lg:text-[140px] text-foreground/[0.03] absolute -top-10 -left-10 select-none pointer-events-none">
          {feature.number}
        </div>
        <div className="relative z-10">
          <div className="text-sm font-mono tracking-widest text-cyan-500/60 uppercase mb-6 flex items-center gap-4">
            <span className="w-8 h-px bg-cyan-500/40" />
            Phase {feature.number}
          </div>
          <h3 className="text-4xl lg:text-5xl font-light tracking-tight text-foreground mb-8 leading-tight">
            {feature.title}
          </h3>
          <p className="text-lg lg:text-xl text-muted-foreground leading-relaxed font-light max-w-lg">
            {feature.description}
          </p>
        </div>
      </div>
      
      <div className="flex-1 w-full aspect-square max-h-[500px] relative group">
        <div className="absolute inset-0 bg-foreground/[0.02] rounded-3xl transition-transform duration-700 group-hover:scale-[1.02]" />
        <div className="absolute inset-4 lg:inset-8">
          {feature.visual}
        </div>
      </div>
    </div>
  );
}
