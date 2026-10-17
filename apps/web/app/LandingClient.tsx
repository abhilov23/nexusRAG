"use client";

import "./landing-theme.css";
import { SiteNav } from "@/components/marketing/site-nav";
import { Hero } from "@/components/marketing/hero";
import { MarqueeBand } from "@/components/marketing/marquee-band";
import { Journey, ProofBand } from "@/components/marketing/journey";
import { GraphShowcase } from "@/components/marketing/graph-showcase";
import { Queries } from "@/components/marketing/queries";
import { StackGrid } from "@/components/marketing/stack-grid";
import { DitherCta } from "@/components/marketing/chromatic-hero";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function LandingClient() {
  return (
    <main className="nx2 nx2-grain min-h-screen overflow-x-clip">
      <SiteNav />
      <Hero />
      <div className="pt-16">
        <MarqueeBand />
      </div>
      <Journey />
      <ProofBand />
      <GraphShowcase />
      <Queries />
      <StackGrid />
      <div id="get-started" className="scroll-mt-24 pt-24 sm:pt-32">
        <DitherCta />
      </div>
      <SiteFooter />
    </main>
  );
}
