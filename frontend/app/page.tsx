import { Navigation } from "@/components/landing/navigation";
import { HeroSection } from "@/components/landing/hero-section";
import { PipelineStory } from "@/components/landing/pipeline-story";
import { OutputsSection } from "@/components/landing/outputs-section";
import { ByokSection } from "@/components/landing/byok-section";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqSection } from "@/components/landing/faq-section";
import { CtaSection } from "@/components/landing/cta-section";
import { FooterSection } from "@/components/landing/footer-section";
import { IntroLoader } from "@/components/landing/intro-loader";
import { RibbonField } from "@/components/landing/ribbon-field";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-x-clip text-foreground selection:bg-[var(--brand-1)]/25">
      <IntroLoader />
      {/* Layers, back to front: colour wash, ribbons and clay shapes, content. */}
      <div className="page-wash pointer-events-none fixed inset-0 -z-10" aria-hidden />
      <RibbonField />
      <Navigation />
      <div className="relative z-[1]">
        <HeroSection />
        <PipelineStory />
        <OutputsSection />
        <ByokSection />
        <PricingSection />
        <FaqSection />
        <CtaSection />
        <FooterSection />
      </div>
    </main>
  );
}
