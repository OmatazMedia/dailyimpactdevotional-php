/**
 * PWA helpers — install prompt capture, standalone detection, service worker
 * registration, and a tiny shared store so multiple components (Footer badge,
 * InstallPrompt banner) stay in sync without prop-drilling.
 */

type Listener = () => void;

interface InstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** true when the browser has fired beforeinstallprompt (app installable). */
  canInstall: boolean;
  /** true when running as an installed standalone app (splash shows here). */
  isStandalone: boolean;
  /** true once the appinstalled event has fired. */
  isInstalled: boolean;
  /** true on iOS Safari (no beforeinstallprompt — needs manual Add to Home). */
  isIOS: boolean;
  /** true on desktop browsers (Chrome/Edge — installable via address-bar icon). */
  isDesktop: boolean;
}

const listeners = new Set<Listener>();
let deferredPrompt: InstallPromptEventLike | null = null;
let promptConsumed = false;

let state: PwaState = {
  canInstall: false,
  isStandalone: false,
  isInstalled: false,
  isIOS: false,
  isDesktop: false,
};

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari legacy
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Desktop = a non-iOS browser without a coarse (touch) primary pointer. */
function detectDesktop(): boolean {
  if (typeof window === "undefined") return false;
  if (detectIOS()) return false;
  const coarse = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
  return !coarse;
}

function emit() {
  listeners.forEach((l) => l());
}

export function subscribePwa(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPwaState(): PwaState {
  return state;
}

let initDone = false;

/** Capture the install prompt + display-mode changes once, on first call. */
export function initPwa() {
  if (initDone || typeof window === "undefined") return;
  initDone = true;

  state = {
    ...state,
    isStandalone: detectStandalone(),
    isIOS: detectIOS(),
    isDesktop: detectDesktop(),
  };

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt = e as InstallPromptEventLike;
    state = { ...state, canInstall: true };
    emit();
  });

  window.addEventListener("appinstalled", () => {
    state = { ...state, isInstalled: true, canInstall: false };
    emit();
  });

  // Detect entering/leaving standalone mode (e.g. installed app opened vs browser).
  if (window.matchMedia) {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handler = () => {
      state = { ...state, isStandalone: mq.matches };
      emit();
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else (mq as unknown as { addListener: (h: () => void) => void }).addListener(handler);
  }
}

/**
 * Trigger the native install dialog. Only callable from a user gesture
 * (button tap). Returns the outcome.
 */
export async function promptInstall(): Promise<"installed" | "dismissed" | "unavailable"> {
  const prompt = deferredPrompt;
  if (!prompt || promptConsumed) return "unavailable";
  promptConsumed = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      state = { ...state, isInstalled: true, canInstall: false };
      emit();
      return "installed";
    }
    // Prompt was shown and dismissed — the same deferred prompt can never be
    // reused, so stop advertising installability to avoid a dead button.
    state = { ...state, canInstall: false };
    emit();
    return "dismissed";
  } catch {
    return "unavailable";
  } finally {
    deferredPrompt = null;
  }
}

/** Register the service worker (guarded: HTTPS/localhost only). */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!window.isSecureContext) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch(() => {
        /* SW is an enhancement — never block the app on it. */
      });
  });
}
