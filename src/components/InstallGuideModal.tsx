import { useEffect } from "react";

interface InstallGuideModalProps {
  open: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  /** "ios" → Share → Add to Home Screen; "desktop" → address-bar install icon; "browser" → menu steps. */
  mode: "ios" | "browser" | "desktop";
}

/**
 * Small modal explaining how to install the app manually — used on iOS Safari
 * (no beforeinstallprompt) and as a fallback when the native prompt is
 * unavailable (desktop browsers, Firefox, etc.).
 */
export default function InstallGuideModal({ open, onClose, isDarkMode, mode }: InstallGuideModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const card = isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200";
  const stepCard = isDarkMode ? "bg-slate-800/60 border-slate-700/60" : "bg-slate-50 border-slate-200";

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[pwaFadeIn_0.25s_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-sm rounded-3xl border p-6 shadow-2xl ${card} animate-[pwaScaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center overflow-hidden">
              <img src="/icons/icon-192.png" alt="" className="w-full h-full object-contain" draggable={false} />
            </div>
            <div>
              <h3 className={`text-sm font-extrabold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                Install Daily Impact
              </h3>
              <p className={`text-[11px] ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                {mode === "ios" ? "Add to your Home Screen" : mode === "desktop" ? "Install the desktop app" : "Install from your browser"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-400 hover:text-black hover:bg-slate-100"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {mode === "ios" ? (
            <>
              <Step
                n={1}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Tap the Share button"
                detail="In Safari, tap the square-with-arrow icon at the bottom of the screen."
              />
              <Step
                n={2}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Choose “Add to Home Screen”"
                detail="Scroll down the share sheet and tap “Add to Home Screen”."
              />
              <Step
                n={3}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Tap “Add”"
                detail="Daily Impact appears on your Home Screen and opens full-screen like an app."
              />
            </>
          ) : mode === "desktop" ? (
            <>
              <Step
                n={1}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Click the install icon in the address bar"
                detail="In Chrome or Edge, look for the ⊕ install icon at the right end of the address bar (next to the star / lock icons)."
              />
              <Step
                n={2}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Choose “Install”"
                detail="A dialog opens — click “Install” (or “Install Daily Impact Devotional”)."
              />
              <Step
                n={3}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Launch from your desktop"
                detail="A shortcut is added to your desktop / taskbar and the app opens in its own window — even offline."
              />
            </>
          ) : (
            <>
              <Step
                n={1}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Open the browser menu"
                detail="Tap the ⋮ or ☰ menu at the top-right of your browser."
              />
              <Step
                n={2}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Choose “Install app”"
                detail="Look for “Install app”, “Add to Home Screen”, or “Create shortcut”."
              />
              <Step
                n={3}
                isDarkMode={isDarkMode}
                stepCard={stepCard}
                title="Confirm"
                detail="Tap Install / Add and Daily Impact will launch like a native app."
              />
            </>
          )}
        </div>

        <p className={`mt-5 text-center text-[11px] ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
          {mode === "desktop"
            ? "The site must be served over HTTPS (or localhost) for installation."
            : "On Android Chrome you'll get a native install dialog — even easier."}
        </p>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest transition-all"
        >
          Got it
        </button>
      </div>

      <style>{`
        @keyframes pwaFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pwaScaleIn { from { opacity: 0; transform: scale(0.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}

function Step({ n, title, detail, isDarkMode, stepCard }: {
  n: number;
  title: string;
  detail: string;
  isDarkMode: boolean;
  stepCard: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 ${stepCard}`}>
      <span className="w-6 h-6 rounded-full bg-teal-brand text-white text-[11px] font-black flex items-center justify-center shrink-0">
        {n}
      </span>
      <div>
        <p className={`text-[12px] font-bold ${isDarkMode ? "text-white" : "text-slate-900"}`}>{title}</p>
        <p className={`text-[11px] leading-snug mt-0.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>{detail}</p>
      </div>
    </div>
  );
}
