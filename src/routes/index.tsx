import { createFileRoute } from "@tanstack/react-router";
import { LandingNav } from "@/components/landing/LandingNav";
import { Hero } from "@/components/landing/Hero";
import { PipelinesSection } from "@/components/landing/PipelinesSection";
import { DiferenciaisSection } from "@/components/landing/DiferenciaisSection";

import { FaqSection } from "@/components/landing/FaqSection";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingNav />
      <main>
        <Hero />
        <PipelinesSection />
        <DiferenciaisSection />
        
        <FaqSection />
      </main>
      <LandingFooter />
    </div>
  );
}
