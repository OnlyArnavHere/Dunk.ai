"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Boxes, CircuitBoard, KeyRound, MessagesSquare, Plus, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { saveDraftPrompt } from "@/lib/draft-prompt";

const EXAMPLES = [
  "A soil-moisture sensor that texts me when my plants are thirsty",
  "A BLE heart-rate chest strap with a week of battery life",
  "A LoRa weather station that runs on a small solar panel",
  "A USB-C power bank with a battery-level display",
];

const CHIPS = ["Smart plant monitor", "BLE wearable", "LoRa weather station", "USB-C power bank"];

const STEPS = [
  {
    icon: MessagesSquare,
    tint: "bg-[#4f8cff]",
    title: "Describe the device in plain words. DunkAI asks the questions an engineer would.",
    label: "Requirements interview",
  },
  {
    icon: Boxes,
    tint: "bg-[#1b1c1f] dark:bg-[#3a3b42]",
    title: "Six agents draft the architecture, pick real parts, and lay out the board while you watch.",
    label: "Live pipeline",
    raised: true,
  },
  {
    icon: CircuitBoard,
    tint: "bg-[#f29a4a]",
    title: "Export the schematic, PCB, 3D model, BOM, firmware stubs and docs.",
    label: "Engineering package",
  },
];

export function HeroSection() {
  const router = useRouter();
  const { user } = useAuth();
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);

  // Typewriter placeholder. Pauses while the visitor is typing.
  useEffect(() => {
    if (value) return;
    const target = `Example: “${EXAMPLES[exampleIndex]}”`;
    if (placeholder.length < target.length) {
      const t = window.setTimeout(() => setPlaceholder(target.slice(0, placeholder.length + 1)), 32);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setPlaceholder("");
      setExampleIndex((i) => (i + 1) % EXAMPLES.length);
    }, 2200);
    return () => window.clearTimeout(t);
  }, [value, placeholder, exampleIndex]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const prompt = value.trim() || EXAMPLES[exampleIndex];
    saveDraftPrompt(prompt);
    router.push(user ? "/workspace" : "/signup");
  };

  const firstName = user?.name?.split(" ")[0];

  return (
    <section data-ribbon="hero" className="relative overflow-hidden pb-20 pt-32 sm:pt-40">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="relative">
          {/* data-ribbon-anchor: the hero ribbon is routed around this headline. */}
          <h1 data-ribbon-anchor className="max-w-3xl text-[44px] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-[72px]">
            <span className="text-greeting">Hi {firstName || "maker"},</span>{" "}
            <span className="block">what are we building today?</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            Describe a device. DunkAI turns it into requirements, an architecture, a real bill of materials, a
            routed PCB and firmware — in one conversation.
          </p>

          {/* Kevin, peeking over the cards like the reference's robot. */}
          <div className="pointer-events-none absolute -bottom-28 right-0 hidden select-none lg:block" aria-hidden>
            <div className="glass shadow-soft absolute -left-36 -top-4 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm font-medium leading-snug">
              Hey there! <span className="inline-block animate-[arcade-float_2s_ease-in-out_infinite]">👋</span>
              <br />
              Got a board in mind?
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/kevin.webp" alt="" width={150} height={150} className="h-[150px] w-[150px] [image-rendering:pixelated]" />
          </div>
        </div>

        <div className="relative z-10 mt-16 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, tint, title, label, raised }, i) => (
            <div
              key={label}
              className={`shadow-soft rounded-[28px] border border-border bg-card p-7 transition-transform duration-300 hover:-translate-y-1 ${
                raised ? "md:translate-y-8 md:hover:translate-y-7" : ""
              }`}
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tint} text-white`}>
                <Icon className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[21px] font-medium md:mt-10 leading-snug tracking-[-0.01em]">{title}</p>
              <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono text-xs text-muted-foreground/70">0{i + 1}</span>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* The composer. Works: the idea is carried through signup into the workspace. */}
        <form onSubmit={submit} className="relative z-10 mt-20 rounded-[32px] border border-border bg-secondary/60 p-2 md:mt-24">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Unlimited with your own API keys
            </span>
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--brand-2)]" />
              Powered by six specialist agents
            </span>
          </div>
          <div className="shadow-soft rounded-[26px] border border-border bg-card p-3 sm:p-4">
            <div className="flex items-start gap-3">
              <span className="mt-2.5 hidden text-muted-foreground sm:block" aria-hidden>
                <Plus className="h-5 w-5" />
              </span>
              <label htmlFor="hero-prompt" className="sr-only">
                Describe the hardware you want to build
              </label>
              <textarea
                id="hero-prompt"
                rows={2}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={placeholder}
                className="min-h-[56px] flex-1 resize-none bg-transparent py-2 text-base leading-relaxed outline-none placeholder:text-muted-foreground/80 sm:text-[17px]"
              />
              <button
                type="submit"
                aria-label="Start designing"
                className="mt-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setValue(`Design a ${chip.toLowerCase()}`)}
                  className="rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground/95 transition-opacity hover:opacity-85"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
