import Link from "next/link";
import Image from "next/image";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Outputs", href: "#outputs" },
      { label: "Pricing", href: "#pricing" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/signup" },
      { label: "API keys", href: "/settings" },
      { label: "Workspace", href: "/workspace" },
    ],
  },
];

export function FooterSection() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-14 sm:px-6 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={30} height={24} className="h-6 w-auto [image-rendering:pixelated]" />
            <span className="text-[17px] font-semibold tracking-tight">DunkAI</span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The hardware copilot. Describe a device, get a board.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-12">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-semibold">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} DunkAI. Review every design before fabrication.
      </div>
    </footer>
  );
}
