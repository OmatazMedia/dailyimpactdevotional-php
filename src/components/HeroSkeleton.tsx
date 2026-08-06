import React from "react";

interface HeroSkeletonProps {
  isDarkMode: boolean;
}

/**
 * Placeholder for the site-wide hero banner while settings are loading.
 * Matches the Hero banner's exact dimensions so the layout never jumps and
 * the default image never flashes before the configured hero image is known.
 */
export default function HeroSkeleton({ isDarkMode }: HeroSkeletonProps) {
  return (
    <div
      id="hero-banner-skeleton"
      aria-busy="true"
      aria-label="Loading banner"
      className={`relative w-full aspect-[32/5] overflow-hidden bg-slate-950 ${
        isDarkMode ? "bg-slate-900" : "bg-slate-300"
      }`}
    >
      <div
        className={`absolute inset-0 animate-pulse ${
          isDarkMode ? "bg-slate-800" : "bg-slate-200"
        }`}
      />
      <div
        className={`absolute inset-0 opacity-60 ${
          isDarkMode
            ? "bg-[radial-gradient(circle_at_30%_40%,rgba(13,148,136,0.18),transparent_60%)]"
            : "bg-[radial-gradient(circle_at_30%_40%,rgba(13,148,136,0.15),transparent_60%)]"
        }`}
      />
    </div>
  );
}
