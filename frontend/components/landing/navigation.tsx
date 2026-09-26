"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const navLinks = [
  { name: "Features", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Metrics", href: "#studio" },
  { name: "Pricing", href: "#pricing" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed z-50 transition-all duration-700 ${
        isScrolled ? "top-4 left-4 right-4" : "top-6 left-6 right-6"
      }`}
    >
      <nav
        className={`mx-auto transition-all duration-700 max-w-[1400px] ${
          isScrolled || isMobileMenuOpen
            ? "bg-background/90 backdrop-blur-2xl border border-border shadow-sm px-2"
            : "bg-transparent px-2"
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-700 px-6 lg:px-8 ${
            isScrolled ? "h-16" : "h-20"
          }`}
        >
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group z-50">
            <Image src="/logo.png" alt="DunkAI" width={40} height={32} className="h-8 w-auto" priority />
            <span className="font-serif italic tracking-tight text-foreground text-2xl lg:text-3xl">
              DunkAI
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-10">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="text-sm tracking-wide text-foreground/90 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors duration-300 relative group font-medium"
              >
                {link.name}
                <span className="absolute -bottom-2 left-0 w-0 h-[1px] bg-gradient-to-r from-emerald-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 transition-all duration-300 group-hover:w-full" />
              </a>
            ))}
          </div>

          {/* Desktop CTA & Theme */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="text-sm tracking-wide text-foreground/90 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors duration-300 font-medium"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="group relative flex items-center gap-2 h-10 px-6 rounded-full bg-card shadow-sm border border-border hover:border-emerald-500/40 hover:bg-secondary transition-all duration-300 overflow-hidden hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 dark:via-emerald-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <span className="relative z-10 text-sm font-semibold tracking-wide text-foreground group-hover:text-foreground transition-colors">
                Get Started
              </span>
              <ArrowUpRight className="w-3.5 h-3.5 text-foreground/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 relative z-10" />
            </Link>
          </div>

          {/* Mobile Menu Button & Theme */}
          <div className="md:hidden flex items-center gap-2 z-50">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-foreground/80 hover:text-foreground transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu - Full Screen Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-background z-40 transition-all duration-700 ${
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ top: 0 }}
      >
        <div className="flex flex-col h-full px-8 pt-32 pb-12 overflow-y-auto">
          {/* Navigation Links */}
          <div className="flex-1 flex flex-col justify-center gap-8 min-h-[min-content]">
            {navLinks.map((link, i) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-5xl font-serif italic text-foreground hover:text-foreground/70 transition-all duration-500 ${
                  isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
                style={{ transitionDelay: isMobileMenuOpen ? `${i * 100}ms` : "0ms" }}
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Bottom CTAs */}
          <div
            className={`flex flex-col gap-4 pt-12 mt-8 border-t border-border transition-all duration-700 ${
              isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? "400ms" : "0ms" }}
          >
            <Link 
              href="/signup"
              onClick={() => setIsMobileMenuOpen(false)}
              className="group relative flex items-center justify-center gap-2 w-full h-14 rounded-full bg-card shadow-sm border border-border hover:border-emerald-500/40 hover:bg-secondary transition-all duration-300 overflow-hidden active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 dark:via-emerald-400/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <span className="relative z-10 text-lg font-semibold tracking-wide text-foreground group-hover:text-foreground transition-colors">
                Get Started
              </span>
              <ArrowUpRight className="w-4 h-4 text-foreground/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-all duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 relative z-10" />
            </Link>
            <Button
              asChild
              variant="outline"
              className="w-full border-border text-foreground hover:bg-secondary rounded-full h-14 text-lg font-medium"
            >
              <Link href="/login" onClick={() => setIsMobileMenuOpen(false)}>
                Log in
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
