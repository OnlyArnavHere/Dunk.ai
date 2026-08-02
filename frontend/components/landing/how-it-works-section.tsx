"use client";

import { useEffect, useRef, useState } from "react";
import { CircuitBoard, Layers3, Sparkles } from "lucide-react";

const steps = [
  {
    number: "I",
    title: "Describe your hardware",
    description:
      "Start with a natural-language brief. DunkAI extracts requirements, constraints, interfaces, and open questions.",
    icon: Sparkles,
    code: `const brief = await dunkai.requirements({
  idea: 'low-power temperature sensor',
  connectivity: 'WiFi',
  batteryLife: '5+ years'
})

// Requirements mapped`,
  },
  {
    number: "II",
    title: "Explore the design",
    description:
      "Move through architecture, components, power, and validation in one connected workspace.",
    icon: CircuitBoard,
    code: `const design = await dunkai.design({
  architecture: 'sensor-hub',
  components: ['STM32L476', 'TMP117'],
  validate: true
})

// Design reviewed`,
  },
  {
    number: "III",
    title: "Hand off the board",
    description:
      "Export a board-ready package with BOM, schematics, KiCad PCB files, validation notes, and documentation.",
    icon: Layers3,
    code: `const package = await dunkai.export({
  formats: ['kicad', 'bom', 'pdf'],
  include: ['validation', 'docs']
})

// Ready for review`,
  },
];

export function HowItWorksSection() {
  const [activeStep, setActiveStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.15 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="relative overflow-hidden border-y border-border/40 bg-background py-24 text-foreground lg:py-32"
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_36%),radial-gradient(circle_at_right,rgba(185,192,202,0.08),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_30%)]" />
        <div className="absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:linear-gradient(180deg,transparent,black_18%,black_82%,transparent)]" />
        <div className="absolute left-[-8rem] top-24 h-64 w-64 rounded-full bg-foreground/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-6 lg:px-12">
        <div className="mb-16 max-w-3xl lg:mb-20">
          <span className="mb-5 inline-flex items-center gap-3 text-xs font-mono uppercase tracking-[0.24em] text-muted-foreground">
            <span className="h-px w-8 bg-foreground/25" />
            DunkAI workflow
          </span>
          <h2
            className={`max-w-2xl font-display text-4xl leading-[0.96] tracking-tight transition-all duration-700 lg:text-6xl ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            From idea.
            <br />
            <span className="text-muted-foreground">To a board.</span>
          </h2>
          <p
            className={`mt-5 max-w-2xl text-sm leading-7 text-muted-foreground transition-all duration-700 delay-100 lg:text-base ${
              isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
          >
            Move from a plain-language brief to a validated hardware package without leaving the workspace.
          </p>
        </div>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-14">
          <div className="space-y-4">
            {steps.map((step, index) => {
              const Icon = step.icon;

              return (
                <button
                  key={step.number}
                  type="button"
                  onClick={() => setActiveStep(index)}
                  aria-pressed={activeStep === index}
                  className={`group w-full rounded-[1.35rem] border p-5 text-left transition-all duration-300 lg:p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    activeStep === index
                      ? "border-accent/40 bg-card/95 shadow-[0_18px_60px_rgba(0,0,0,0.24)]"
                      : "border-border/70 bg-card/70 hover:-translate-y-0.5 hover:border-accent/25 hover:bg-card/90 hover:shadow-[0_16px_40px_rgba(0,0,0,0.16)]"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors duration-300 ${
                        activeStep === index
                          ? "border-accent/40 bg-accent/10 text-accent-foreground"
                          : "border-border bg-background/40 text-muted-foreground group-hover:border-accent/30 group-hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex items-center gap-3">
                        <span
                          className={`font-mono text-xs tracking-[0.24em] transition-colors duration-300 ${
                            activeStep === index ? "text-accent" : "text-muted-foreground"
                          }`}
                        >
                          {step.number}
                        </span>
                        <span
                          className={`h-px flex-1 transition-colors duration-300 ${
                            activeStep === index ? "bg-accent/40" : "bg-border/70"
                          }`}
                        />
                      </div>
                      <h3 className="text-xl font-medium leading-tight lg:text-2xl">{step.title}</h3>
                      <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground lg:text-[15px]">
                        {step.description}
                      </p>

                      {activeStep === index && (
                        <div className="mt-5 overflow-hidden rounded-full bg-background/70">
                          <div
                            className="h-px w-0 bg-accent/70"
                            style={{ animation: "progress 5s linear forwards" }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:sticky lg:top-28 self-start">
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[0_24px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-border/70 bg-background/70 px-5 py-4">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-white/20" />
                  <span className="h-3 w-3 rounded-full bg-white/20" />
                  <span className="h-3 w-3 rounded-full bg-white/20" />
                </div>
                <div className="flex items-center gap-2 text-[11px] font-mono tracking-[0.18em] text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                  design-package.ts
                </div>
              </div>

              <div className="bg-[#0b0c0f] px-5 py-6 lg:px-6 lg:py-7">
                <div className="mb-4 flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground/80">
                  <span className="rounded-full border border-border/70 bg-white/5 px-2 py-1 text-accent">
                    Live preview
                  </span>
                  <span>AI workspace</span>
                </div>

                <div className="rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 shadow-inner shadow-black/30">
                  <pre className="font-mono text-sm leading-7 text-[#d7dce3]">
                    {steps[activeStep].code.split("\n").map((line, lineIndex) => (
                      <div
                        key={`${activeStep}-${lineIndex}`}
                        className="code-line-reveal flex"
                        style={{ animationDelay: `${lineIndex * 70}ms` }}
                      >
                        <span className="mr-4 w-5 shrink-0 select-none text-right text-[11px] leading-7 text-white/20">
                          {lineIndex + 1}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">
                          {line.split("").map((char, charIndex) => (
                            <span
                              key={`${activeStep}-${lineIndex}-${charIndex}`}
                              className={`code-char-reveal ${char === " " ? "inline-block min-w-[0.35rem]" : ""}`}
                              style={{ animationDelay: `${lineIndex * 70 + charIndex * 12}ms` }}
                            >
                              {char === " " ? "\u00A0" : char}
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                    <span
                      className="ml-9 inline-block h-4 w-[1px] translate-y-1 bg-accent align-middle animate-pulse"
                      aria-hidden="true"
                    />
                  </pre>
                </div>

                <div className="mt-5 flex items-center gap-3 rounded-full border border-border/60 bg-background/50 px-4 py-3 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(185,192,202,0.12)]" />
                  Design package ready
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes progress {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }

        .code-line-reveal {
          opacity: 0;
          transform: translateY(6px);
          animation: lineReveal 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes lineReveal {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .code-char-reveal {
          opacity: 0;
          filter: blur(6px);
          animation: charReveal 0.28s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }

        @keyframes charReveal {
          to {
            opacity: 1;
            filter: blur(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .code-line-reveal,
          .code-char-reveal {
            animation: none;
            opacity: 1;
            filter: none;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
