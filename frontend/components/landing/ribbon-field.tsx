"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { onIntroDone } from "@/lib/intro";
import type { SectionBox } from "./ribbon-scene";

const RibbonScene = dynamic(() => import("./ribbon-scene"), { ssr: false });

/** Starts loading the scene's code early; the intro loader waits on this. */
export const preloadRibbonScene = () => import("./ribbon-scene");

/**
 * The fixed layer behind the landing page that holds the ribbons and clay
 * shapes (see ribbon-scene.tsx).
 *
 * It measures every `[data-ribbon]` section in page coordinates, and measures
 * again whenever the layout moves (resize, fonts loading, images, an accordion
 * opening), because the art is positioned against those boxes.
 */
export function RibbonField() {
  const [sections, setSections] = useState<SectionBox[] | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const introStart = useRef<number | null>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => onIntroDone(() => (introStart.current = performance.now())), []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let timer = 0;
    const measure = () => {
      const scrollY = window.scrollY;
      const boxes = Array.from(document.querySelectorAll<HTMLElement>("[data-ribbon]")).map((el) => {
        const rect = el.getBoundingClientRect();
        const anchor = el.querySelector<HTMLElement>("[data-ribbon-anchor]")?.getBoundingClientRect();
        return {
          key: el.dataset.ribbon as string,
          top: Math.round(rect.top + scrollY),
          height: Math.round(rect.height),
          ...(anchor ? { anchorLeft: Math.round(anchor.left) } : {}),
        };
      });
      setWidth(document.documentElement.clientWidth);
      // Skip identical layouts: rebuilding the tubes is the expensive part.
      setSections((prev) => (prev && JSON.stringify(prev) === JSON.stringify(boxes) ? prev : boxes));
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(measure, 120);
    };

    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    window.addEventListener("resize", schedule);

    // Render only while a decorated section is on screen.
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
        setActive(visible.size > 0);
      },
      { rootMargin: "20% 0px" }
    );
    document.querySelectorAll("[data-ribbon]").forEach((el) => io.observe(el));

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
      io.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      {sections && width > 0 && (
        <RibbonScene
          key={resolvedTheme}
          sections={sections}
          width={width}
          dark={resolvedTheme === "dark"}
          active={active}
          reducedMotion={reducedMotion}
          introStart={introStart}
        />
      )}
    </div>
  );
}
