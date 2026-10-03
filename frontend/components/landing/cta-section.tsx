import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function CtaSection() {
  return (
    <section data-ribbon="cta" className="relative px-4 py-24 sm:px-6 sm:py-32">
      <div className="page-wash shadow-soft relative mx-auto max-w-6xl overflow-hidden rounded-[40px] border border-border px-6 py-20 text-center sm:px-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kevin.webp" alt="" width={84} height={84} className="mx-auto h-[84px] w-[84px] [image-rendering:pixelated]" />
        <h2 className="mx-auto mt-6 max-w-2xl text-4xl font-semibold tracking-[-0.035em] sm:text-6xl">
          Your next board starts with <span className="text-soft">one sentence.</span>
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-lg text-muted-foreground">
          Free to start. No card. Bring your own keys whenever you like.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start building free <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center rounded-full border border-border bg-card px-6 py-3 text-[15px] font-medium hover:bg-secondary"
          >
            See how it works
          </a>
        </div>
      </div>
    </section>
  );
}
