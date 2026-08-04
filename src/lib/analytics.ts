/**
 * Lightweight first-party website analytics.
 *
 * - Records ONE "visit" per browser session (sessionStorage-keyed), then sends
 *   a heartbeat every 20s and finalizes the time-on-site on unload via a
 *   keepalive fetch. No third-party cookies, no external services — the data
 *   goes straight to the site's own backend (analytics.php / mock server).
 * - The admin dashboard and /admin routes are never tracked (initAnalytics is
 *   called with skip=true there).
 */

import { API_BASE } from "../config/api";

const SESSION_KEY = "did_analytics_session";
const START_KEY = "did_analytics_start";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function startTime(): number {
  try {
    const raw = sessionStorage.getItem(START_KEY);
    if (!raw) {
      sessionStorage.setItem(START_KEY, String(Date.now()));
      return Date.now();
    }
    return parseInt(raw, 10) || Date.now();
  } catch {
    return Date.now();
  }
}

export function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/.test(ua) || (navigator.maxTouchPoints > 1 && /MacIntel/.test(navigator.platform || ""))) {
    return "tablet";
  }
  if (/Mobi|Android|iPhone|iPod/.test(ua)) return "mobile";
  return "desktop";
}

function post(action: string, extra: Record<string, unknown> = {}, keepalive = false): void {
  if (typeof window === "undefined") return;
  const payload: Record<string, unknown> = {
    sessionId: sessionId(),
    page: window.location.pathname + window.location.search,
    referrer: document.referrer || "",
    locale: (navigator.language || "en").slice(0, 50),
    device: detectDevice(),
    ...extra,
  };
  try {
    fetch(`${API_BASE}/analytics.php?action=${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive,
    }).catch(() => {});
  } catch {
    /* tracking is best-effort — never break the app over it */
  }
}

let started = false;

/**
 * Begin tracking for this page session. Safe to call multiple times; only the
 * first call (per page load) has any effect.
 */
export function initAnalytics(skip = false): void {
  if (started || typeof window === "undefined") return;
  started = true;
  if (skip) return;

  const st = startTime();
  post("visit");

  const heartbeat = window.setInterval(() => post("heartbeat"), 20_000);

  const finalize = () => {
    const dur = Math.max(0, Math.round((Date.now() - st) / 1000));
    post("leave", { durationSeconds: dur }, true);
    window.clearInterval(heartbeat);
  };

  window.addEventListener("beforeunload", finalize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalize();
  });
}
