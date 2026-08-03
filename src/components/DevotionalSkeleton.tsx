import React from "react";

/**
 * Pulsing placeholder shown while the homepage's initial data load is running.
 * Renders a card shaped like DevotionalView so the layout doesn't jump, and so
 * the page never flashes the misleading "No Devotional for Today" state (or the
 * fallback image) while devotionals/settings/headers are still arriving.
 */
export default function DevotionalSkeleton({ isDarkMode }: { isDarkMode: boolean }) {
  const block = isDarkMode ? "bg-slate-800" : "bg-slate-200";
  const blockSoft = isDarkMode ? "bg-slate-800/60" : "bg-slate-100";

  return (
    <div
      aria-busy="true"
      aria-label="Loading today's devotional"
      className={`rounded-3xl p-6 md:p-10 border ${
        isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-100"
      } animate-pulse`}
    >
      {/* Image area */}
      <div className={`w-full h-40 md:h-56 rounded-2xl ${block} mb-6`} />

      {/* Date + share row */}
      <div className="flex items-center justify-between mb-4">
        <div className={`h-3 w-32 rounded-full ${blockSoft}`} />
        <div className="flex gap-2">
          <div className={`h-8 w-8 rounded-full ${blockSoft}`} />
          <div className={`h-8 w-8 rounded-full ${blockSoft}`} />
        </div>
      </div>

      {/* Title */}
      <div className={`h-6 w-3/4 rounded-lg ${block} mb-2`} />
      <div className={`h-6 w-1/2 rounded-lg ${block} mb-5`} />

      {/* Scripture box */}
      <div className={`h-24 rounded-xl ${blockSoft} mb-6`} />

      {/* Paragraphs */}
      <div className="space-y-3">
        <div className={`h-4 w-full rounded ${blockSoft}`} />
        <div className={`h-4 w-full rounded ${blockSoft}`} />
        <div className={`h-4 w-5/6 rounded ${blockSoft}`} />
        <div className={`h-4 w-full rounded ${blockSoft}`} />
        <div className={`h-4 w-4/6 rounded ${blockSoft}`} />
      </div>
    </div>
  );
}
