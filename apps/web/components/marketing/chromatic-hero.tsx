"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { DitherShader } from "@/components/ui/dither-shader";
import { CHROMATIC_TEXTURE } from "./chromatic-texture";

/**
 * Closing call-to-action over an animated dither-shader backdrop.
 *
 * Grayscale Bayer dither, animated slowly: monochrome texture that moves
 * without introducing any hue. Content stays crisp above it — the shader never
 * touches text.
 */
export function DitherCta() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-[1200px] px-5 pb-24 sm:px-8">
      <div className="relative overflow-hidden rounded-[28px] border border-[var(--nx-border-strong)]">
        <DitherShader
          src={CHROMATIC_TEXTURE}
          ditherMode="bayer"
          colorMode="grayscale"
          gridSize={3}
          animated
          animationSpeed={0.015}
          brightness={-0.25}
          contrast={1.1}
          backgroundColor="#09090b"
          className="absolute inset-0 h-full w-full"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_90%_at_50%_50%,transparent_30%,rgba(9,9,11,0.72)_100%)]" />
        <div className="relative px-7 py-14 text-center sm:px-12 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.24em] text-white/60">
            START WITH YOUR CODE
          </p>
          <h2 className="font-display mx-auto mt-4 max-w-[600px] text-balance text-[clamp(30px,4vw,50px)] font-semibold leading-[1.03] tracking-[-0.04em] text-white">
            Make the next question easier to answer.
          </h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-[#FAFAFA] px-6 text-sm font-semibold text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Get started <ArrowRight size={15} />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center px-4 text-sm text-white/70 transition-colors hover:text-white"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[12px] text-white/50">
            <Check size={13} /> Private by design
            <span aria-hidden="true">·</span> Public GitHub repositories
            <span aria-hidden="true">·</span> Every answer cites its source
          </p>
        </div>
      </div>
    </section>
  );
}
