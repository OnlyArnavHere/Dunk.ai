"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="relative py-40 lg:py-56 bg-[#03060c] border-t border-emerald-500/10 overflow-hidden">
      {/* Background Engineering Visual (Subtle Grid + Glow) */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-full h-full max-w-[1200px] opacity-[0.03] mix-blend-screen" style={{ backgroundImage: 'radial-gradient(#10b981 2px, transparent 2px)', backgroundSize: '60px 60px' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08)_0%,rgba(6,182,212,0.03)_30%,rgba(0,0,0,0)_60%)] blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
        
        {/* Subtle moving abstract trace */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 1000 1000" preserveAspectRatio="none">
           <defs>
             <linearGradient id="cta-trace" x1="0" y1="0" x2="1" y2="0">
               <stop offset="0%" stopColor="#10b981" />
               <stop offset="100%" stopColor="#06b6d4" />
             </linearGradient>
           </defs>
           <path d="M 0 800 L 300 800 L 400 500 L 600 500 L 700 200 L 1000 200" fill="none" stroke="url(#cta-trace)" strokeWidth="1.5" strokeDasharray="10 20">
             <animate attributeName="stroke-dashoffset" from="30" to="0" dur="2s" repeatCount="indefinite" />
           </path>
        </svg>
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col items-center text-center">
        <div className={`w-px h-24 bg-gradient-to-b from-transparent to-white/20 mb-12 transition-all duration-1000 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-12"
        }`} />

        <h2 className={`text-6xl lg:text-[100px] font-light tracking-[-0.03em] text-white leading-[0.9] mb-10 transition-all duration-1000 ease-out delay-100 ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
        }`}>
          Ready to build
          <br />
          <span className="font-serif italic text-white/50">something great?</span>
        </h2>

        <p className={`text-xl lg:text-3xl text-white/40 mb-16 leading-relaxed max-w-3xl mx-auto font-light transition-all duration-1000 delay-300 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          Join engineering teams shipping hardware faster with DunkAI. 
          Start free, scale infinitely.
        </p>

        <div className={`flex flex-col sm:flex-row items-center justify-center gap-6 transition-all duration-1000 delay-500 ease-out ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          <Button asChild size="lg" className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-white border-none px-12 h-16 text-lg rounded-full group font-medium shadow-[0_0_40px_rgba(16,185,129,0.3)] transition-all hover:scale-105">
            <Link href="/signup">
              Start building free
              <ArrowRight className="w-5 h-5 ml-3 transition-transform group-hover:translate-x-1.5" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-16 px-12 text-lg rounded-full border-emerald-500/30 text-emerald-100/80 hover:text-white hover:bg-emerald-500/10 font-medium transition-all hover:border-emerald-500/50">
            <Link href="/workspace">Launch workspace</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
