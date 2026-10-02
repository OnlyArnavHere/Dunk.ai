"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { introDone, markIntroDone } from "@/lib/intro";
import { preloadRibbonScene } from "./ribbon-field";

/**
 * The landing page's intro: a counter that tracks real readiness, then lifts
 * like a curtain while the hero ribbon draws itself in behind it.
 *
 * Progress is earned, not faked: fonts, the page's own load event, and the
 * 3D scene's code each move the target. The displayed number eases toward it.
 * A minimum hold keeps a fast load from flashing, and a hard ceiling means a
 * stuck request can never trap a visitor behind it.
 *
 * Rendered in the static HTML, so it covers the page from the first paint.
 * Client-side navigation back to "/" does not replay it (lib/intro.ts).
 */

const STATUS = [
  "Waking up the agents",
  "Reading the parts catalogue",
  "Warming up the board router",
  "Ready",
];

const MIN_MS = 1200;
const MAX_MS = 6000;

export function IntroLoader() {
  const [shown, setShown] = useState(() => !introDone());
  const [leaving, setLeaving] = useState(false);
  const [count, setCount] = useState(0);
  const target = useRef(8);
  const shownCount = useRef(0);

  useEffect(() => {
    if (!shown) return;
    const started = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const bump = (amount: number) => (target.current = Math.min(100, target.current + amount));
    let finished = false;

    document.fonts?.ready.then(() => bump(30)).catch(() => bump(30));
    preloadRibbonScene().then(() => bump(32)).catch(() => bump(32));
    if (document.readyState === "complete") bump(30);
    else window.addEventListener("load", () => bump(30), { once: true });

    let frame = 0;
    const tick = () => {
      // Ease the visible number toward the earned target.
      shownCount.current += (target.current - shownCount.current) * (target.current >= 100 ? 0.16 : 0.08);
      const value = Math.round(shownCount.current);
      setCount(value);

      const elapsed = performance.now() - started;
      if (!finished && ((value >= 99 && elapsed >= MIN_MS) || elapsed >= MAX_MS)) {
        finished = true;
        setCount(100);
        setLeaving(true);
        markIntroDone();
        root.style.overflow = previousOverflow;
        window.setTimeout(() => setShown(false), reduce ? 300 : 1000);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      root.style.overflow = previousOverflow;
    };
  }, [shown]);

  if (!shown) return null;

  const status = STATUS[Math.min(STATUS.length - 1, Math.floor((count / 100) * (STATUS.length - 1) + 0.0001))];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading DunkAI, ${count}%`}
      className={`fixed inset-0 z-[100] flex flex-col bg-background transition-[clip-path,opacity] duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)] motion-reduce:transition-opacity motion-reduce:duration-300 ${
        leaving ? "[clip-path:inset(0_0_100%_0)] motion-reduce:opacity-0" : "[clip-path:inset(0_0_0_0)]"
      }`}
    >
      <div className="page-wash pointer-events-none absolute inset-0" aria-hidden />

      <div className={`relative flex flex-1 flex-col px-6 py-6 transition-opacity duration-300 sm:px-10 sm:py-8 ${leaving ? "opacity-0" : "opacity-100"}`}>
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="" width={30} height={24} className="h-6 w-auto [image-rendering:pixelated]" priority />
          <span className="text-[17px] font-semibold tracking-tight">DunkAI</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kevin.webp"
            alt=""
            width={112}
            height={112}
            className="h-28 w-28 animate-[arcade-float_1.6s_ease-in-out_infinite] [image-rendering:pixelated]"
          />
          <p key={status} className="text-sm text-muted-foreground animate-in fade-in duration-500">
            {status}…
          </p>
        </div>

        <div className="flex items-end justify-between gap-6">
          <p className="max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
            Describe a device.
            <br />
            Get a board.
          </p>
          <p className="font-semibold leading-none tracking-[-0.05em] tabular-nums text-[22vw] sm:text-[11vw]" aria-hidden>
            {count}
            <span className="text-[0.35em] align-top text-muted-foreground">%</span>
          </p>
        </div>
      </div>

      <div className="relative h-[3px] w-full bg-border">
        <div className="h-full bg-foreground transition-[width] duration-150 ease-out" style={{ width: `${count}%` }} />
      </div>
    </div>
  );
}
