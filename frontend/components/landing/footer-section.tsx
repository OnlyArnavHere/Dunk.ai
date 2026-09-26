"use client";

import Link from "next/link";

const footerLinks = {
  Product: [
    { name: "Features", href: "#features" },
    { name: "How it works", href: "#how-it-works" },
    { name: "Live metrics", href: "#studio" },
    { name: "Pricing", href: "#pricing" },
  ],
  Platform: [
    { name: "AI Agents", href: "#features" },
    { name: "Workspace", href: "/workspace" },
    { name: "Requirements Agent", href: "#how-it-works" },
    { name: "Architecture Agent", href: "#how-it-works" },
  ],
  Company: [
    { name: "About", href: "#" },
    { name: "Blog", href: "#" },
    { name: "Careers", href: "#", badge: "Hiring" },
    { name: "Contact", href: "#" },
  ],
  Legal: [
    { name: "Privacy", href: "#" },
    { name: "Terms", href: "#" },
    { name: "Security", href: "#" },
  ],
};

const socialLinks = [
  { name: "Twitter", href: "#" },
  { name: "GitHub", href: "#" },
  { name: "LinkedIn", href: "#" },
];

export function FooterSection() {
  return (
    <footer className="bg-card border-t border-border pt-24 lg:pt-32 pb-12">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-12 lg:gap-8 mb-24">
          <div className="col-span-2 md:col-span-5 pr-8">
            <Link href="/" className="inline-block mb-8">
              <span className="text-4xl font-serif italic text-foreground tracking-tight">DunkAI</span>
            </Link>
            <p className="text-muted-foreground leading-relaxed font-light max-w-sm mb-10">
              The AI-powered hardware engineering copilot. Describe your idea in natural language and get manufacturing-ready designs.
            </p>
            <div className="flex gap-6">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  className="text-sm font-medium text-foreground/70 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  {link.name}
                </a>
              ))}
            </div>
          </div>

          <div className="col-span-2 md:col-span-7 grid grid-cols-2 md:grid-cols-4 gap-8">
            {Object.entries(footerLinks).map(([title, links]) => (
              <div key={title}>
                <h3 className="text-sm font-medium text-foreground mb-6 tracking-wide">{title}</h3>
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.name}>
                      <a
                        href={link.href}
                        className="text-sm font-medium text-foreground/70 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors inline-flex items-center gap-2"
                      >
                        {link.name}
                        {"badge" in link && link.badge && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border border-border text-foreground/70 rounded-full">
                            {link.badge}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-sm font-light text-muted-foreground">
            © 2026 DunkAI. All rights reserved.
          </p>

          <div className="flex items-center gap-3 text-sm font-light text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            All systems operational
          </div>
        </div>
      </div>
    </footer>
  );
}
