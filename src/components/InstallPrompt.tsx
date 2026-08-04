import { useEffect, useState } from "react";
import { getPwaState, initPwa, promptInstall, subscribePwa } from "../lib/pwa";
import InstallGuideModal from "./InstallGuideModal";

/**
 * Subtle bottom banner that lets visitors know the site can be installed as an
 * app. Appears a couple of seconds after the page loads, only when the browser
 * has fired `beforeinstallprompt` (i.e. the app is actually installable) and we
 * are NOT already running as an installed app. Remembered per-session so it
 * doesn't nag on every navigation, and dismissed permanently once the user
 * installs.
 */
export default function InstallPrompt() {
  const [canShow, setCanShow] = useState(false);

  useEffect(() => {
    initPwa();
    const sync = () => {
      const s = getPwaState();
      setCanShow(s.canInstall && !s.isStandalone && !s.isInstalled);
    };
    sync();
    const unsub = subscribePwa(sync);
    return unsub;
  }, []);

  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("pwa-install-dismissed") === "1",
  );

  // Delay so the page has a chance to paint first — keep it subtle.
  useEffect(() => {
    if (!canShow) return;
    const t = window.setTimeout(() => setVisible(true), 2500);
    return () => window.clearTimeout(t);
  }, [canShow]);

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  const [guideMode, setGuideMode] = useState<"ios" | "browser" | "desktop">("browser");
  const [guideOpen, setGuideOpen] = useState(false);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "installed") {
      setCanShow(false);
      setVisible(false);
    } else if (outcome === "unavailable") {
      // No native prompt available → show manual install steps instead.
      // Desktop browsers (Chrome/Edge) install from the address-bar icon;
      // iOS Safari uses Share → Add to Home Screen; other mobiles use the menu.
      const s = getPwaState();
      setGuideMode(s.isIOS ? "ios" : s.isDesktop ? "desktop" : "browser");
      setGuideOpen(true);
      dismiss();
    }
    // "dismissed" → canInstall flipped off by promptInstall, banner hides itself.
  };

  if (!canShow || dismissed || !visible) return null;

  return (
    <div className="fixed bottom-4 inset-x-0 z-[900] flex justify-center px-4 animate-[pwaSlideUp_0.45s_cubic-bezier(0.16,1,0.3,1)]">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-[0_20px_60px_-15px_rgba(2,6,23,0.45)] p-3.5 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
          <img src="/icons/icon-192.png" alt="" className="w-full h-full object-contain" draggable={false} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
            Install Daily Impact
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
            Get today's devotional as an app — installs on phone or desktop and works offline.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleInstall}
            className="px-3.5 py-2 rounded-lg bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.97] text-white text-[11px] font-black uppercase tracking-wide transition-all"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pwaSlideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <InstallGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        isDarkMode={false}
        mode={guideMode}
      />
    </div>
  );
}
