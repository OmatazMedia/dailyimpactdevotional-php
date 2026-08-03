import { useEffect, useRef, useState } from "react";
import { getPwaState, initPwa, subscribePwa } from "../lib/pwa";

interface PwaSplashProps {
  /** true once the app's initial data has finished loading in the background. */
  isReady: boolean;
}

type Phase = "loading" | "almost" | "here";

const PHASE_TEXT: Record<Phase, string> = {
  loading: "Loading…",
  almost: "Almost there…",
  here: "It's here!",
};

/**
 * Full-screen splash shown ONLY when the site runs as an installed PWA
 * (display-mode: standalone, incl. legacy iOS navigator.standalone) — never in
 * a normal browser tab. The logo sits on a brand-dark backdrop while the app's
 * data loads behind it. The status text advances Loading… → Almost there… →
 * It's here!, then the overlay fades away to reveal the content that has been
 * quietly rendering underneath.
 */
export default function PwaSplash({ isReady }: PwaSplashProps) {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [fading, setFading] = useState(false);
  const [unmounted, setUnmounted] = useState(false);

  const readyRef = useRef(isReady);
  readyRef.current = isReady;

  const MIN_TIME = 2400; // minimum splash duration (ms) so the animation reads
  const MAX_WAIT = 8000; // hard cap so the splash can never hang forever

  // Only show when running as an installed standalone app — reuse the shared
  // detection (covers legacy iOS navigator.standalone too).
  useEffect(() => {
    initPwa();
    const sync = () => setShow(getPwaState().isStandalone);
    sync();
    return subscribePwa(sync);
  }, []);

  // Drive the phase timeline with a self-rescheduling timeout chain:
  // Loading… → Almost there… → (ready or MAX_WAIT, past MIN_TIME) → It's here! → fade.
  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const startedAt = Date.now();

    const finish = () => {
      if (cancelled) return;
      setPhase("here");
      window.setTimeout(() => setFading(true), 900);
    };

    const step = () => {
      if (cancelled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed < 1100) setPhase("loading");
      else if (elapsed < 2200) setPhase("almost");

      if ((readyRef.current || elapsed >= MAX_WAIT) && elapsed >= MIN_TIME) {
        finish();
        return;
      }
      window.setTimeout(step, 120);
    };

    const timer = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [show]);

  // Unmount once the fade-out transition has completed.
  useEffect(() => {
    if (!fading) return;
    const t = window.setTimeout(() => setUnmounted(true), 700);
    return () => window.clearTimeout(t);
  }, [fading]);

  if (unmounted || !show) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-slate-950 transition-opacity duration-700 ease-out ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      {/* Ambient brand glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(13,148,136,0.30),transparent_65%)]" />
      {/* Faint wordmark watermark */}
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-slate-900/60 font-serif font-black text-[18vw] sm:text-[10rem] whitespace-nowrap select-none pointer-events-none">
        Daily Impact
      </div>

      {/* Ring + logo */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-teal-brand/25 animate-ping" />
        <div className="absolute -inset-7 rounded-full border-2 border-dashed border-teal-brand/50 animate-spin [animation-duration:6s]" />
        <div className="absolute -inset-12 rounded-full border border-slate-800 animate-spin [animation-duration:12s] [animation-direction:reverse]" />
        <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-white shadow-[0_20px_70px_-15px_rgba(13,148,136,0.55)] flex items-center justify-center overflow-hidden">
          <img
            src="/icons/icon-512.png"
            alt="Daily Impact"
            className="w-[80%] h-[80%] object-contain"
            draggable={false}
          />
        </div>
      </div>

      {/* Brand */}
      <div className="mt-12 text-center">
        <p className="text-white font-serif text-2xl sm:text-3xl font-extrabold tracking-tight">
          Daily Impact
        </p>
        <p className="mt-1.5 text-teal-300/90 text-[11px] uppercase tracking-[0.4em] font-black">
          Devotional
        </p>
      </div>

      {/* Status text + progress */}
      <div className="mt-12 w-56">
        <div className="flex items-center justify-center gap-2">
          {phase === "here" ? (
            <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : (
            <span className="w-4 h-4 rounded-full border-2 border-teal-brand/30 border-t-teal-brand animate-spin" />
          )}
          <p className="text-sm font-semibold text-slate-200">
            {PHASE_TEXT[phase]}
          </p>
        </div>
        <div className="mt-4 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-brand to-emerald-400 transition-all duration-700 ease-out"
            style={{ width: phase === "here" ? "100%" : phase === "almost" ? "72%" : "30%" }}
          />
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .animate-spin, .animate-ping { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
