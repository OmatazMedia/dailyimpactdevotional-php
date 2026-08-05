import React, { useEffect, useRef, useState } from "react";
import { Heart, Home, BookOpen } from "lucide-react";

interface DonationThanksProps {
  name: string; // empty string when anonymous
  amount: number;
  currency: string;
  isDarkMode: boolean;
  onClose: () => void;
  onHome: () => void;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵", KES: "KSh ",
  ZAR: "R", CAD: "C$", AUD: "A$", ZMW: "ZK ", XOF: "CFA ",
};

/**
 * Full-screen celebration page shown after a successful online donation.
 * Renders a canvas confetti burst (no external library), greets the donor by
 * name (or "Friend" when anonymous), confirms the amount received and closes
 * with a blessing. Replaces the whole public page so it feels like a real
 * redirect to a thank-you screen.
 */
export default function DonationThanks({ name, amount, currency, isDarkMode, onClose, onHome }: DonationThanksProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [running, setRunning] = useState(true);

  const displayName = name.trim() !== "" ? name.trim().split(" ")[0] : "Friend";
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const formatted = symbol + Number(amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

  // ── Canvas confetti burst ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let raf = 0;
    let startedAt = Date.now();
    const DURATION = 6000; // ms of active falling before we fade out

    const colors = ["#0d9488", "#f59e0b", "#10b981", "#fbbf24", "#14b8a6", "#f97316", "#ffffff"];

    interface Piece {
      x: number; y: number; w: number; h: number;
      color: string; vy: number; vx: number; sway: number; phase: number; rot: number; vr: number;
      opacity: number;
    }

    const pieces: Piece[] = Array.from({ length: 180 }, () => ({
      x: Math.random() * width,
      y: -30 - Math.random() * height * 0.4,
      w: 6 + Math.random() * 7,
      h: 9 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vy: 1.6 + Math.random() * 2.6,
      vx: (Math.random() - 0.5) * 1.2,
      sway: 0.6 + Math.random() * 1.4,
      phase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      opacity: 0.9 + Math.random() * 0.1,
    }));

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const fade = elapsed > DURATION ? Math.max(0, 1 - (elapsed - DURATION) / 1200) : 1;
      ctx.clearRect(0, 0, width, height);

      for (const p of pieces) {
        p.vy += 0.012; // gravity
        p.phase += 0.03;
        p.x += p.vx + Math.sin(p.phase) * p.sway * 0.4;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > height + 40) {
          // Recycle from the top so the celebration keeps flowing
          p.y = -30;
          p.x = Math.random() * width;
        }
        ctx.save();
        ctx.globalAlpha = p.opacity * fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (fade > 0) raf = requestAnimationFrame(tick);
      else setRunning(false);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 relative overflow-hidden ${
      isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-800"
    }`}>
      {/* Confetti layer */}
      <canvas ref={canvasRef} className={`fixed inset-0 z-20 pointer-events-none transition-opacity duration-700 ${running ? "opacity-100" : "opacity-0"}`} />

      <div className="flex-grow flex items-center justify-center px-4 py-16 relative z-10">
        <div className={`w-full max-w-xl rounded-3xl p-8 md:p-12 text-center border shadow-2xl custom-shadow space-y-6 ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-100"
        }`}>
          {/* Celebratory header */}
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-teal-brand to-emerald-500 flex items-center justify-center text-white shadow-[0_10px_40px_-8px_rgba(13,148,136,0.6)] animate-pulse">
            <Heart className="w-10 h-10 fill-current" />
          </div>

          <div className="space-y-2">
            <p className={`text-[11px] font-black uppercase tracking-[0.25em] ${isDarkMode ? "text-teal-400" : "text-teal-brand"}`}>
              🎉 Donation Received
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-extrabold tracking-tight">
              Thank You, {displayName}!
            </h1>
          </div>

          {/* Amount card */}
          <div className={`inline-block px-8 py-4 rounded-2xl border ${
            isDarkMode ? "bg-slate-950/60 border-teal-brand/30" : "bg-teal-brand/5 border-teal-brand/25"
          }`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
              Your Gift
            </p>
            <p className="font-serif text-3xl md:text-4xl font-extrabold text-teal-brand dark:text-teal-400">
              {formatted}
            </p>
          </div>

          <p className={`text-sm md:text-base leading-relaxed max-w-md mx-auto ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>
            Your donation of <strong className={isDarkMode ? "text-white" : "text-slate-900"}>{formatted}</strong> has been
            received with thanksgiving. It will go a long way in helping us take the Word of God to more lives every single day.
          </p>

          {/* Blessing */}
          <div className={`rounded-2xl p-5 border ${
            isDarkMode ? "bg-amber-500/10 border-amber-500/20" : "bg-amber-50 border-amber-200/60"
          }`}>
            <p className="font-serif italic text-lg md:text-xl font-bold text-amber-600 dark:text-amber-400">
              “God bless you, {displayName}. May the Lord multiply it back to you a hundredfold.” 🙏
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={onHome}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-widest hover:opacity-90 active:scale-[0.98] transition-all shadow-lg shadow-teal-500/20"
            >
              <Home className="w-4 h-4" /> Back to Homepage
            </button>
            <button
              onClick={onClose}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl border text-xs font-black uppercase tracking-widest hover:scale-[1.01] active:scale-[0.98] transition-all ${
                isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-900" : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <BookOpen className="w-4 h-4" /> Continue Reading
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
