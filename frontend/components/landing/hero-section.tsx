"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

function PcbVisual() {
  return (
    <div className="relative w-full aspect-square max-w-[600px] mx-auto transition-transform duration-1000 hover:scale-[1.02]">
      {/* Realistic PCB SVG */}
      <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)]">
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.6"/>
          </filter>
          <filter id="inner-shadow">
            <feOffset dx="0" dy="2"/>
            <feGaussianBlur stdDeviation="3" result="offset-blur"/>
            <feComposite operator="out" in="SourceGraphic" in2="offset-blur" result="inverse"/>
            <feFlood floodColor="black" floodOpacity="0.8" result="color"/>
            <feComposite operator="in" in="color" in2="inverse" result="shadow"/>
            <feComposite operator="over" in="shadow" in2="SourceGraphic"/>
          </filter>
          <filter id="red-glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="metal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a1a1aa" />
            <stop offset="50%" stopColor="#52525b" />
            <stop offset="100%" stopColor="#d4d4d8" />
          </linearGradient>
          
          <pattern id="pcb-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.5" fill="#10251A" fillOpacity="0.4" />
            <path d="M 0 10 L 20 10 M 10 0 L 10 20" stroke="#10251A" strokeWidth="0.2" fill="none" opacity="0.3" />
          </pattern>
        </defs>
        
        {/* PCB Board Base (Rich Emerald/Green) */}
        <rect x="20" y="20" width="360" height="360" rx="16" fill="#061f12" stroke="#104225" strokeWidth="2" filter="url(#shadow)" />
        
        {/* Inner Copper / Ground Plane slightly lighter */}
        <rect x="28" y="28" width="344" height="344" rx="12" fill="#092f1a" filter="url(#inner-shadow)" />
        
        {/* Grid pattern overlay */}
        <rect x="28" y="28" width="344" height="344" rx="12" fill="url(#pcb-grid)" />

        {/* Traces - Amber & Cyan */}
        <g opacity="0.8">
          {/* Main Bus lines (Amber/Copper) */}
          <path d="M 60 200 L 140 200 L 160 180" fill="none" stroke="#b45309" strokeWidth="6" />
          <path d="M 60 210 L 135 210 L 160 185" fill="none" stroke="#b45309" strokeWidth="6" />
          
          {/* Fine silver/cyan traces */}
          <path d="M 120 80 L 120 120 L 160 160" fill="none" stroke="#06b6d4" strokeWidth="1" />
          <path d="M 130 80 L 130 115 L 165 150" fill="none" stroke="#06b6d4" strokeWidth="1" />
          <path d="M 140 80 L 140 110 L 170 140" fill="none" stroke="#06b6d4" strokeWidth="1" />
          
          <path d="M 280 80 L 280 120 L 240 160" fill="none" stroke="#10b981" strokeWidth="1" />
          <path d="M 270 80 L 270 115 L 235 150" fill="none" stroke="#10b981" strokeWidth="1" />
          
          <path d="M 240 240 L 280 280 L 320 280" fill="none" stroke="#71717a" strokeWidth="1.5" strokeDasharray="4 2" />
          <path d="M 160 240 L 120 280 L 80 280" fill="none" stroke="#71717a" strokeWidth="1" />
        </g>

        {/* Active Signal Trace */}
        <path d="M 80 320 L 140 320 L 180 280 L 180 240" fill="none" stroke="#0ea5e9" strokeWidth="1.5" filter="url(#red-glow)" opacity="0.9">
          <animate attributeName="stroke-dasharray" values="0,150;150,0" dur="2.5s" repeatCount="indefinite" />
        </path>

        {/* Mounting Holes */}
        {[
          [44, 44], [356, 44], [44, 356], [356, 356]
        ].map(([cx, cy], i) => (
          <g key={`mh-${i}`}>
            <circle cx={cx} cy={cy} r="14" fill="#0B1A13" stroke="#a1a1aa" strokeWidth="2" opacity="0.4" />
            <circle cx={cx} cy={cy} r="10" fill="url(#metal-grad)" />
            <circle cx={cx} cy={cy} r="6" fill="#000" filter="url(#inner-shadow)" />
          </g>
        ))}

        {/* Vias */}
        <g opacity="0.7">
          {[
            [160, 140], [165, 150], [170, 140],
            [240, 160], [235, 150], [230, 160],
            [160, 240], [165, 230], [170, 240],
            [240, 240], [235, 250], [230, 240],
          ].map(([cx, cy], i) => (
            <circle key={`via-${i}`} cx={cx} cy={cy} r="2.5" fill="#07120D" stroke="#a1a1aa" strokeWidth="1" />
          ))}
        </g>

        {/* Components */}
        
        {/* USB-C Connector J1 */}
        <g transform="translate(10, 180)" filter="url(#shadow)">
          <rect x="0" y="0" width="22" height="40" rx="2" fill="url(#metal-grad)" />
          <rect x="4" y="2" width="16" height="36" rx="1" fill="#27272a" />
          <rect x="14" y="8" width="4" height="24" rx="0.5" fill="#000" />
        </g>

        {/* GPIO Header J2 */}
        <g transform="translate(340, 120)" filter="url(#shadow)">
          <rect x="0" y="0" width="14" height="160" rx="2" fill="#18181b" stroke="#27272a" strokeWidth="1" />
          {Array.from({ length: 16 }).map((_, i) => (
            <circle key={`hdr-${i}`} cx="7" cy={8 + i * 9.6} r="2.5" fill="url(#metal-grad)" />
          ))}
        </g>

        {/* Memory/Secondary ICs U2, U3 */}
        <g transform="translate(260, 240)" filter="url(#shadow)">
          <rect x="0" y="0" width="40" height="24" rx="2" fill="#111216" stroke="#27272a" strokeWidth="1" />
          <circle cx="6" cy="6" r="2" fill="#000" />
          <text x="20" y="14" fill="#52525b" fontSize="6" fontFamily="monospace" textAnchor="middle">SRAM</text>
          <text x="-12" y="14" fill="#3f624d" fontSize="10" fontFamily="monospace">U2</text>
        </g>
        
        <g transform="translate(100, 260)" filter="url(#shadow)">
          <rect x="0" y="0" width="24" height="24" rx="2" fill="#111216" stroke="#27272a" strokeWidth="1" />
          <circle cx="4" cy="4" r="1.5" fill="#000" />
          <text x="-12" y="14" fill="#3f624d" fontSize="10" fontFamily="monospace">U3</text>
        </g>

        {/* Passive Components (Capacitors/Resistors) */}
        <g transform="translate(140, 100)" filter="url(#shadow)">
          <rect x="0" y="0" width="6" height="12" fill="#27272a" />
          <rect x="0" y="0" width="6" height="3" fill="url(#metal-grad)" />
          <rect x="0" y="9" width="6" height="3" fill="url(#metal-grad)" />
          <text x="-14" y="9" fill="#3f624d" fontSize="8" fontFamily="monospace">C12</text>
        </g>
        <g transform="translate(150, 100)" filter="url(#shadow)">
          <rect x="0" y="0" width="6" height="12" fill="#27272a" />
          <rect x="0" y="0" width="6" height="3" fill="url(#metal-grad)" />
          <rect x="0" y="9" width="6" height="3" fill="url(#metal-grad)" />
          <text x="10" y="9" fill="#3f624d" fontSize="8" fontFamily="monospace">C13</text>
        </g>

        {/* Status LEDs (Color Accents) */}
        <g transform="translate(80, 80)">
          <rect x="0" y="0" width="8" height="12" rx="1" fill="#18181b" />
          <rect x="1" y="2" width="6" height="8" rx="1" fill="#10b981" filter="url(#red-glow)">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1.5s" repeatCount="indefinite" />
          </rect>
          <text x="14" y="9" fill="#10b981" fontSize="8" fontFamily="monospace">PWR</text>
        </g>
        
        <g transform="translate(100, 80)">
          <rect x="0" y="0" width="8" height="12" rx="1" fill="#18181b" />
          <rect x="1" y="2" width="6" height="8" rx="1" fill="#06b6d4" filter="url(#red-glow)" opacity="0.4">
            <animate attributeName="opacity" values="0.2;0.8;0.2" dur="0.8s" repeatCount="indefinite" />
          </rect>
          <text x="14" y="9" fill="#06b6d4" fontSize="8" fontFamily="monospace">ACT</text>
        </g>

        {/* Central IC - U1 (Main Processor) */}
        <g transform="translate(160, 160)" filter="url(#shadow)">
          {/* Pins Base (Silver) */}
          <rect x="-4" y="-4" width="88" height="88" rx="2" fill="url(#metal-grad)" />
          
          {/* Pin Gaps (Dark) */}
          {Array.from({ length: 16 }).map((_, i) => (
            <g key={`pin-gaps-${i}`}>
              <rect x={6 + i * 4.5} y="-5" width="2" height="90" fill="#0b0c0f" />
              <rect x="-5" y={6 + i * 4.5} width="90" height="2" fill="#0b0c0f" />
            </g>
          ))}
          
          {/* Chip Body */}
          <rect x="0" y="0" width="80" height="80" rx="4" fill="#0f1115" stroke="#10b981" strokeWidth="1.5" opacity="0.9" />
          <rect x="4" y="4" width="72" height="72" rx="2" fill="#111216" />
          
          {/* Core Outline */}
          <rect x="24" y="24" width="32" height="32" rx="1" fill="none" stroke="#06b6d4" strokeWidth="1" filter="url(#red-glow)" opacity="0.5" />
          
          {/* Markings */}
          <circle cx="10" cy="10" r="3" fill="#27272a" />
          <text x="40" y="42" fill="#d4d4d8" fontSize="12" fontFamily="sans-serif" fontWeight="bold" letterSpacing="1" textAnchor="middle">DUNK AI</text>
          <text x="40" y="54" fill="#71717a" fontSize="7" fontFamily="monospace" textAnchor="middle">NPU-V2 / 0xFA21</text>
        </g>
        <text x="140" y="150" fill="#3f624d" fontSize="12" fontFamily="monospace" fontStyle="italic">U1</text>


      </svg>
    </div>
  );
}

export function HeroSection() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative min-h-screen flex flex-col justify-center overflow-hidden bg-[#05070A]">
      {/* Layered Technical Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03] mix-blend-screen" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12)_0%,rgba(0,0,0,0)_60%)] blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.12)_0%,rgba(0,0,0,0)_60%)] blur-3xl" />
        
        {/* Subtle grid lines */}
        <div className="absolute inset-0 border-t border-l border-white/[0.02] w-full h-full" style={{ backgroundSize: '200px 200px', backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)' }} />
      </div>

      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-6 lg:px-12 pt-32 pb-20 flex flex-col lg:flex-row items-center justify-between min-h-[90vh] gap-16">
        
        {/* LEFT: Typography & CTA */}
        <div className="flex-1 w-full max-w-2xl flex flex-col justify-center relative">


          <h1 
            className={`text-[clamp(3.5rem,7vw,7rem)] font-light leading-[0.9] tracking-[-0.03em] text-white transition-all duration-1000 ease-out delay-100 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
          >
            <span className="block mb-4 text-white/90">From idea to</span>
            <span className="block font-serif italic text-white pr-4">
              manufacturing.
            </span>
          </h1>

          <p 
            className={`mt-10 text-lg lg:text-xl text-white/50 leading-relaxed max-w-lg font-light transition-all duration-1000 delay-300 ease-out ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            DunkAI is the AI-powered hardware engineering copilot. 
            Describe your idea in natural language and get 
            manufacturing-ready PCB designs in days, not months.
          </p>
          
          <div 
            className={`mt-12 flex items-center gap-6 transition-all duration-1000 delay-500 ease-out ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
          >
            <Link 
              href="/workspace"
              className="group relative inline-flex items-center justify-center h-14 px-8 lg:px-10 rounded-full overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 active:scale-95 active:translate-y-0 shadow-[0_0_20px_rgba(16,185,129,0.15)] hover:shadow-[0_0_40px_rgba(16,185,129,0.3)]"
            >
              {/* Outer Border Layer */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500/40 via-cyan-500/40 to-emerald-500/40 p-[1px]">
                {/* Inner Background */}
                <div className="absolute inset-[1px] bg-gradient-to-r from-[#03150d] to-[#020b0f] rounded-full group-hover:from-[#052015] group-hover:to-[#04151c] transition-colors duration-300" />
              </div>
              
              {/* Subtle top highlight */}
              <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-50" />
              
              {/* Moving shine effect on hover */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
              </div>

              <span className="relative z-10 flex items-center gap-3 text-sm font-medium tracking-wide text-white group-hover:text-emerald-50 transition-colors">
                Try DunkAI Now
                {/* Technical Arrow / Indicator */}
                <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-white/5 border border-white/10 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/50 transition-colors">
                   <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:text-cyan-300 group-hover:translate-x-0.5 transition-transform duration-300" />
                </span>
              </span>
            </Link>
            <span className="text-xs font-mono tracking-widest uppercase text-white/30">
              [ Free Trial ]
            </span>
          </div>
          
          {/* Bottom left metadata */}
          <div className={`absolute -left-4 lg:-left-12 bottom-0 -rotate-90 origin-bottom-left hidden lg:block transition-all duration-1000 delay-700 ease-out ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <span className="text-[10px] font-mono tracking-[0.3em] uppercase text-white/20 whitespace-nowrap">
              AI Engineering Copilot
            </span>
          </div>
        </div>

        {/* CENTER/RIGHT: Visual Composition */}
        <div className={`flex-1 w-full relative flex items-center justify-center lg:justify-end transition-all duration-1000 delay-500 ease-out ${
          isVisible ? "opacity-100 scale-100 filter-none" : "opacity-0 scale-95 blur-sm"
        }`}>
          <div className="relative w-full max-w-[600px]">
            {/* The PCB Art */}
            <PcbVisual />
            

          </div>
        </div>

      </div>
    </section>
  );
}
