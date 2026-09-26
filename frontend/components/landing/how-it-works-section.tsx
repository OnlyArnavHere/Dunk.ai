"use client";

import { useEffect, useRef, useState } from "react";

const pipeline = [
  {
    id: "idea",
    label: "Idea",
    meta: "Natural Language Brief",
    visual: (
      <div className="flex flex-col gap-1 w-full text-[9px] font-mono leading-relaxed p-2">
        <div className="text-muted-foreground">
          <span className="text-emerald-500 mr-1">{'>'}</span>Build a low-power
        </div>
        <div className="text-muted-foreground">
          <span className="text-transparent mr-1">{'>'}</span>WiFi sensor node
        </div>
        <div className="flex items-center gap-1 mt-1">
          <div className="w-1.5 h-3 bg-emerald-500 animate-pulse" />
        </div>
      </div>
    )
  },
  {
    id: "req",
    label: "Requirements",
    meta: "Parameter Extraction",
    visual: (
      <div className="flex flex-col w-full h-full justify-center px-3 py-2 font-mono text-[9px] gap-2">
        <div className="flex items-center justify-between border-b border-border pb-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]" />
            <span className="text-emerald-600 dark:text-emerald-500/70">PWR</span>
          </div>
          <span className="text-foreground">3.3V / 5V</span>
        </div>
        <div className="flex items-center justify-between border-b border-border pb-1">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_5px_rgba(6,182,212,0.5)]" />
            <span className="text-cyan-600 dark:text-cyan-500/70">NET</span>
          </div>
          <span className="text-foreground">WiFi</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_5px_rgba(139,92,246,0.5)]" />
            <span className="text-violet-600 dark:text-violet-500/70">DIM</span>
          </div>
          <span className="text-foreground">50×50 mm</span>
        </div>
      </div>
    )
  },
  {
    id: "arch",
    label: "Architecture",
    meta: "System Design",
    visual: (
      <div className="relative w-full h-full flex items-center justify-center p-2">
        <svg viewBox="0 0 100 60" className="w-full h-full overflow-visible">
          {/* Connections */}
          <path d="M 50 15 L 25 45" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="opacity-80" strokeDasharray="2 2">
            <animate attributeName="stroke-dashoffset" values="10;0" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M 50 15 L 75 45" fill="none" stroke="#0ea5e9" strokeWidth="1.5" className="opacity-80" strokeDasharray="2 2">
            <animate attributeName="stroke-dashoffset" values="10;0" dur="2s" repeatCount="indefinite" />
          </path>
          <path d="M 25 45 L 75 45" fill="none" stroke="#f59e0b" strokeWidth="1" className="opacity-50" />

          {/* Nodes */}
          {/* MCU */}
          <circle cx="50" cy="15" r="8" className="fill-secondary stroke-border" strokeWidth="1.5" />
          <text x="50" y="17.5" className="fill-foreground font-mono" fontSize="6" textAnchor="middle">MCU</text>

          {/* PWR */}
          <circle cx="25" cy="45" r="7" className="fill-background stroke-border" strokeWidth="1" opacity="0.9" />
          <text x="25" y="47.5" className="fill-muted-foreground font-mono" fontSize="5" textAnchor="middle">PWR</text>

          {/* NET */}
          <circle cx="75" cy="45" r="7" className="fill-background stroke-border" strokeWidth="1" opacity="0.9" />
          <text x="75" y="47.5" className="fill-muted-foreground font-mono" fontSize="5" textAnchor="middle">NET</text>

          <defs>
            <linearGradient id="silver-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    )
  },
  {
    id: "comp",
    label: "Components",
    meta: "BOM Selection",
    visual: (
      <div className="flex flex-col w-full h-full justify-center px-3 gap-1.5">
        <div className="flex items-center justify-between bg-secondary/50 border border-border rounded px-2 py-1">
          <span className="text-[8px] font-mono text-foreground/80">MCU</span>
          <span className="text-[8px] text-emerald-500">✓</span>
        </div>
        <div className="flex items-center justify-between bg-secondary/50 border border-border rounded px-2 py-1">
          <span className="text-[8px] font-mono text-foreground/80">WiFi</span>
          <span className="text-[8px] text-emerald-500">✓</span>
        </div>
        <div className="flex items-center justify-between bg-secondary/50 border border-border rounded px-2 py-1">
          <span className="text-[8px] font-mono text-foreground/80">Sensor</span>
          <span className="text-[8px] text-emerald-500">✓</span>
        </div>
      </div>
    )
  },
  {
    id: "eda",
    label: "PCB",
    meta: "Schematic & Layout",
    visual: (
      <div className="relative w-full h-full bg-[#051710] border border-[#0d3423] rounded overflow-hidden p-1 shadow-md dark:shadow-inner">
        <svg viewBox="0 0 100 60" className="w-full h-full opacity-90">
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#144b31" />
          </pattern>
          <rect width="100" height="60" fill="url(#grid)" />

          {/* Traces */}
          <path d="M 10 30 L 40 30 L 50 15 L 80 15" fill="none" stroke="#0ea5e9" strokeWidth="1" opacity="0.8" />
          <path d="M 10 40 L 35 40 L 45 50 L 80 50" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.6" />

          {/* Vias & Pads */}
          <circle cx="10" cy="30" r="2" fill="#d4d4d8" />
          <circle cx="80" cy="15" r="2" fill="#d4d4d8" />
          <circle cx="10" cy="40" r="2" fill="#d4d4d8" />
          <circle cx="80" cy="50" r="2" fill="#d4d4d8" />

          {/* Signal Indicator */}
          <circle cx="40" cy="30" r="1.5" fill="#34d399" filter="url(#glow)">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="1.5s" repeatCount="indefinite" />
          </circle>

          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        </svg>
      </div>
    )
  },
  {
    id: "val",
    label: "Validation",
    meta: "ERC / DRC Checks",
    visual: (
      <div className="flex flex-col w-full h-full justify-center px-3 gap-2 font-mono text-[9px]">
        <div className="flex items-center justify-between group">
          <span className="text-muted-foreground">DRC</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-500">PASS</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">ERC</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-500">PASS</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">POWER</span>
          <div className="flex items-center gap-1">
            <span className="text-emerald-500">PASS</span>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]" />
          </div>
        </div>
      </div>
    )
  },
  {
    id: "mfg",
    label: "Manufacturing",
    meta: "Export Package",
    visual: (
      <div className="relative w-full h-full flex flex-col items-center justify-center p-2 font-mono text-[8px]">
        <div className="flex items-center gap-2 mb-2">
          <div className="px-2 py-1 bg-secondary/50 border border-border rounded text-foreground/80">PCB</div>
          <span className="text-cyan-500">→</span>
          <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/40 rounded text-emerald-600 dark:text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.1)]">GERBER</div>
        </div>
        <div className="flex gap-2">
          <div className="px-1.5 py-0.5 border border-cyan-500/20 rounded text-cyan-600 dark:text-cyan-400/80 bg-cyan-500/5">BOM</div>
          <div className="px-1.5 py-0.5 border border-cyan-500/20 rounded text-cyan-600 dark:text-cyan-400/80 bg-cyan-500/5">FAB</div>
        </div>
      </div>
    )
  },
];

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

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
    <section id="how-it-works" ref={sectionRef} className="relative py-32 lg:py-48 bg-background border-t border-border overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.06)_0%,rgba(0,0,0,0)_60%)] blur-3xl" />
      </div>

      <div className="relative z-10 max-w-[1200px] mx-auto px-6 lg:px-12">
        {/* Editorial Heading */}
        <div className="text-center mb-24 lg:mb-32">
          <h2 className={`text-5xl lg:text-7xl font-light tracking-[-0.02em] text-foreground transition-all duration-1000 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}>
            How it works.
          </h2>
          <p className={`mt-8 max-w-xl mx-auto text-lg text-muted-foreground font-light transition-all duration-1000 delay-200 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
            }`}>
            Move from a plain-language brief to a validated hardware package automatically.
          </p>
        </div>

        {/* Workflow Layout */}
        <div className="relative w-full max-w-5xl mx-auto">
          {/* Central Vertical Line (Desktop only) */}
          <div
            className={`hidden lg:block absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[1px] bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent origin-top transition-transform duration-1000 ease-out delay-500 ${isVisible ? "scale-y-100" : "scale-y-0"
              }`}
          />

          {/* Mobile Left Line */}
          <div
            className={`block lg:hidden absolute left-[31px] top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-emerald-500/30 to-transparent origin-top transition-transform duration-1000 ease-out delay-500 ${isVisible ? "scale-y-100" : "scale-y-0"
              }`}
          />

          <div className="space-y-16 lg:space-y-4">
            {pipeline.map((item, i) => (
              <StepRow key={item.id} item={item} index={i} total={pipeline.length} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepRow({ item, index, total }: { item: typeof pipeline[0], index: number, total: number }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isLeft = index % 2 === 0;

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsRevealed(true);
      },
      { threshold: 0.4, rootMargin: "-10% 0px -10% 0px" }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`relative grid grid-cols-1 lg:grid-cols-[1fr_80px_1fr] gap-6 lg:gap-4 items-center min-h-[160px] transition-all duration-1000 ease-out ${isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}
    >
      {/* Horizontal Connector Line (Desktop) */}
      <div className={`hidden lg:block absolute top-1/2 -translate-y-1/2 w-16 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-1000 ${isRevealed ? "opacity-100" : "opacity-0"
        } ${isLeft ? 'right-[50%] -mr-[32px]' : 'left-[50%] -ml-[32px]'}`} />

      {/* Horizontal Connector Line (Mobile) */}
      <div className={`block lg:hidden absolute top-[28px] left-[32px] w-6 h-[1px] bg-emerald-500/30 transition-opacity duration-1000 ${isRevealed ? "opacity-100" : "opacity-0"
        }`} />

      {/* Mobile Node */}
      <div className="lg:hidden absolute left-2 top-2 w-12 h-12 z-20">
        <CenterNode index={index} isActive={isRevealed} />
      </div>

      {/* LEFT CONTENT */}
      <div className={`lg:col-start-1 lg:justify-self-end w-full max-w-[420px] pl-16 pt-2 lg:pt-0 lg:pl-0 z-10 ${isLeft ? 'block' : 'hidden lg:invisible lg:block'}`}>
        {isLeft && <CardContent item={item} />}
      </div>

      {/* CENTER NODE (Desktop) */}
      <div className="hidden lg:flex lg:col-start-2 justify-center items-center relative h-full z-20">
        <CenterNode index={index} isActive={isRevealed} />
      </div>

      {/* RIGHT CONTENT */}
      <div className={`lg:col-start-3 lg:justify-self-start w-full max-w-[420px] pl-16 pt-2 lg:pt-0 lg:pl-0 z-10 ${!isLeft ? 'block' : 'hidden lg:invisible lg:block'}`}>
        {!isLeft && <CardContent item={item} />}
      </div>
    </div>
  );
}

function CenterNode({ index, isActive }: { index: number; isActive: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-full h-full">
      {/* Halo Glow */}
      <div className={`absolute w-16 h-16 rounded-full bg-emerald-500 transition-all duration-1000 ease-out ${isActive ? 'opacity-20 blur-xl scale-110' : 'opacity-0 blur-md scale-90'
        }`} />

      {/* Node Outer Ring - Gradient */}
      <div className={`relative w-12 h-12 rounded-full p-[1px] transition-all duration-700 ease-out shadow-sm ${isActive ? 'bg-gradient-to-b from-emerald-400 via-cyan-500 to-blue-500 shadow-emerald-500/20' : 'bg-gradient-to-b from-border via-border/80 to-border shadow-sm'
        }`}>
        {/* Node Inner Circle */}
        <div className={`w-full h-full rounded-full flex items-center justify-center transition-colors duration-700 ${isActive ? 'bg-foreground dark:bg-card' : 'bg-secondary dark:bg-card/50'
          }`}>
          <span className={`font-mono text-sm tracking-wide transition-colors duration-700 font-bold ${isActive ? 'text-background dark:text-foreground' : 'text-muted-foreground'
            }`}>
            0{index + 1}
          </span>
        </div>
      </div>
    </div>
  );
}

function CardContent({ item }: { item: typeof pipeline[0] }) {
  return (
    <div className="w-full bg-card border border-border hover:border-emerald-500/30 rounded-2xl p-6 lg:p-8 shadow-2xl transition-colors group relative overflow-hidden">
      {/* Subtle highlight inner border */}
      <div className="absolute inset-0 rounded-2xl border border-foreground/[0.02] pointer-events-none group-hover:border-emerald-500/10 transition-colors" />

      <div className="flex flex-col gap-6 relative z-10">
        <div className="flex items-start justify-between">
          <h3 className="text-2xl font-light text-foreground tracking-tight">{item.label}</h3>

          {/* Engineering Visual Miniature */}
          <div className="w-24 h-20 shrink-0 rounded-lg bg-background border border-emerald-500/10 shadow-inner overflow-hidden flex items-center justify-center group-hover:border-emerald-500/30 transition-colors">
            {item.visual}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-foreground/30" />
            <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">{item.meta}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
