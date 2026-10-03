"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, Sparkles, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const navLinks = [
  { name: "How it works", href: "#how-it-works" },
  { name: "Outputs", href: "#outputs" },
  { name: "Your keys", href: "#byok" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
];

export function Navigation() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4">
      <nav
        aria-label="Main"
        className={cn(
          "mx-auto flex max-w-6xl items-center justify-between rounded-full px-3 py-2 transition-all duration-300",
          scrolled ? "glass shadow-soft" : "bg-transparent"
        )}
      >
        <Link href="/" className="flex items-center gap-2 rounded-full px-2 py-1">
          <Image src="/logo.png" alt="" width={30} height={24} className="h-6 w-auto [image-rendering:pixelated]" priority />
          <span className="text-[17px] font-semibold tracking-tight">DunkAI</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.name}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link
              href="/workspace"
              className="hidden items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
            >
              <Sparkles className="h-4 w-4" />
              Open workspace
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="hidden items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:inline-flex"
              >
                <Sparkles className="h-4 w-4" />
                Start free
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="glass shadow-soft mx-auto mt-2 max-w-6xl rounded-3xl p-3 md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 text-[15px] hover:bg-secondary"
            >
              {link.name}
            </a>
          ))}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href={user ? "/workspace" : "/login"} className="rounded-full border border-border bg-card px-4 py-2.5 text-center text-sm font-medium">
              {user ? "Workspace" : "Sign in"}
            </Link>
            <Link href="/signup" className="rounded-full bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground">
              Start free
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
