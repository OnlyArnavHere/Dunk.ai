"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Boxes, CheckCircle2, CircuitBoard, Cpu, FileCode2, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

// three.js is ~600 KB; it loads only when this section is near the viewport.
const PcbScene = dynamic(() => import("./pcb-scene"), { ssr: false });

const STAGES = [
  {
    icon: MessagesSquare,
    agent: "Requirements Agent",
    title: "It interviews you",
    body: "Four to ten targeted questions — power budget, connectivity, sensors, enclosure, quantity — merged into a structured spec. Nothing you said earlier gets dropped.",
    output: "requirements.json",
  },
  {
    icon: Boxes,
    agent: "Architecture Agent",
    title: "It draws the system",
    body: "The device is split into subsystems and wired with real interfaces — I²C, SPI, UART, USB and power rails — then checked for missing power paths.",
    output: "Block diagram",
  },
  {
    icon: Cpu,
    agent: "Component Intelligence",
    title: "It picks real parts",
    body: "Candidates are retrieved from a catalogue of real components and ranked on interface fit, price and stock, into a BOM with manufacturer part numbers.",
    output: "Priced BOM",
  },
  {
    icon: CircuitBoard,
    agent: "Circuit & PCB",
    title: "It lays out the board",
    body: "A netlist goes to the board generator, which places footprints and routes copper — and hands back the schematic, the layout and a 3D model.",
    output: "Schematic · PCB · GLB",
  },
  {
    icon: CheckCircle2,
    agent: "Validation",
    title: "It checks its own work",
    body: "Design-rule checks and handoff validation run on every board. Errors are shown and labelled, never hidden, so you know exactly what is ready to fabricate.",
    output: "Validation report",
  },
  {
    icon: FileCode2,
    agent: "Documentation & firmware",
    title: "It writes it all up",
    body: "Docs for the design, plus firmware stubs for your MCU: a driver per bus, a pin map, and a README — editable in the built-in code chat.",
    output: "Engineering package",
  },
];

export function PipelineStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [stage, setStage] = useState(0);
  const [near, setNear] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Two observers: one loads the scene a screen early, one pauses rendering
  // whenever the section is not visible at all.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const preload = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "100% 0px" });
    const visible = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    preload.observe(el);
    visible.observe(el);
    return () => {
      preload.disconnect();
      visible.disconnect();
    };
  }, []);

  // Scroll -> progress. The ref feeds the canvas every frame; state changes
  // only when the stage changes, so React renders six times per pass, not
  // once per scroll event.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const p = travel > 0 ? Math.min(Math.max(-rect.top / travel, 0), 1) : 0;
      progress.current = p;
      setStage(Math.min(STAGES.length - 1, Math.floor(p * STAGES.length)));
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const current = STAGES[stage];
  const Icon = current.icon;

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      aria-label="How DunkAI works, in six stages"
      className="relative"
      style={{ height: `${STAGES.length * 90 + 100}svh` }}
    >
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden lg:flex-row lg:items-center">
        {/* Copy */}
        <div className="relative z-10 order-2 mx-auto w-full max-w-6xl px-4 pb-8 sm:px-6 lg:order-1 lg:absolute lg:inset-x-0 lg:pb-0">
          <div className="lg:max-w-[420px]">
            <p className="text-sm font-medium text-muted-foreground">How it works</p>
            <h2 className="mt-2 hidden text-4xl font-semibold tracking-[-0.03em] lg:block">
              One idea in.
              <br />
              <span className="text-soft">A whole board out.</span>
            </h2>

            {/* Stage rail */}
            <ol className="mt-4 flex gap-1.5 lg:mt-8" aria-label="Pipeline stages">
              {STAGES.map((s, i) => (
                <li key={s.agent} className="h-1 flex-1 overflow-hidden rounded-full bg-border" aria-current={i === stage ? "step" : undefined}>
                  <span
                    className={cn("block h-full rounded-full bg-foreground transition-all duration-500", i <= stage ? "w-full" : "w-0")}
                  />
                  <span className="sr-only">{s.agent}</span>
                </li>
              ))}
            </ol>

            <div key={stage} className="glass shadow-soft mt-5 rounded-3xl p-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-mono text-xs text-muted-foreground">
                    {String(stage + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")} · {current.agent}
                  </p>
                  <h3 className="text-xl font-semibold tracking-tight">{current.title}</h3>
                </div>
              </div>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">{current.body}</p>
              <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-1)]" />
                Output: {current.output}
              </p>
            </div>
          </div>
        </div>

        {/* Scene: on desktop, everything right of the copy column — so the
            two can never overlap — and the top half of the screen on phones.
            72rem/1.5rem are the copy container's max-w-6xl and px-6; 420px is
            the copy column plus a 2rem gap. The camera fits the board inside
            whatever box this ends up being. */}
        <div
          className="pointer-events-none relative order-1 h-[52svh] w-full shrink-0 lg:absolute lg:inset-y-0 lg:right-0 lg:left-[calc(max(0px,_(100vw_-_72rem)_/_2)_+_1.5rem_+_420px_+_2rem)] lg:order-none lg:h-full lg:w-auto"
          aria-hidden
        >
          {near && (
            <PcbScene key={resolvedTheme} progress={progress} active={onScreen} reducedMotion={reducedMotion} />
          )}
        </div>
      </div>
    </section>
  );
}
