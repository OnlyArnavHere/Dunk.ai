"use client";

import { useEffect, useState, useRef } from "react";

const metrics = [
  { value: "06", label: "Specialized AI Agents", color: "from-cyan-400 to-blue-500" },
  { value: "07", label: "Engineering Stages", color: "from-emerald-400 to-teal-500" },
  { value: "10x", label: "Faster to Manufacturing", color: "from-amber-400 to-orange-500" },
];

export function MetricsSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

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
    <section id="metrics" ref={sectionRef} className="relative py-32 lg:py-48 bg-background overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/20 dark:via-cyan-500/20 to-transparent" />
      
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="flex flex-col lg:flex-row gap-24 lg:gap-12">
          
          {/* Left: Heading */}
          <div className="flex-1">
            <h2
              className={`text-5xl lg:text-7xl font-light tracking-[-0.02em] text-foreground transition-all duration-1000 ease-out ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}
            >
              The new standard
              <br />
              <span className="font-serif italic text-muted-foreground">in hardware.</span>
            </h2>
            <div className={`mt-16 w-16 h-[1px] bg-border transition-all duration-1000 delay-300 ${
              isVisible ? "opacity-100 w-16" : "opacity-0 w-0"
            }`} />
          </div>
          
          {/* Right: Metrics Stack */}
          <div className="flex-1 flex flex-col gap-16 lg:gap-24 lg:pl-24">
            {metrics.map((metric, index) => (
              <div
                key={metric.label}
                className={`relative flex items-baseline gap-8 transition-all duration-1000 ease-out ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                }`}
                style={{ transitionDelay: `${index * 150 + 200}ms` }}
              >
                <div className={`text-6xl lg:text-[120px] font-serif italic text-transparent bg-clip-text bg-gradient-to-br ${metric.color} leading-none tracking-tighter drop-shadow-lg`}>
                  {metric.value}
                </div>
                <div className="text-base lg:text-lg font-mono tracking-widest uppercase font-bold text-foreground/90 max-w-[150px]">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
