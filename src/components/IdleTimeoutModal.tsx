import React, { useState, useEffect, useRef, useCallback } from "react";
import { LogOut, Clock, AlertTriangle, RefreshCw } from "lucide-react";

interface IdleTimeoutModalProps {
  /** Time in milliseconds before showing the idle warning (default 10 min) */
  idleTimeout?: number;
  /** Countdown duration in seconds once the modal appears (default 30) */
  countdownSeconds?: number;
  /** Called when the user chooses to logout or the countdown expires */
  onLogout: () => void;
}

/**
 * IdleTimeoutModal — monitors user activity and shows a countdown
 * overlay when the admin has been idle for too long. Plays a beep
 * during the countdown. If the countdown expires, calls onLogout().
 */
export default function IdleTimeoutModal({
  idleTimeout = 10 * 60 * 1000, // 10 minutes
  countdownSeconds = 30,
  onLogout,
}: IdleTimeoutModalProps) {
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isBeeping, setIsBeeping] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // Mirrors showModal so the activity handler always sees the latest value
  // (avoids stale closures in document-level listeners).
  const showModalRef = useRef(false);
  // Absolute deadline (Date.now) when the countdown must end — the countdown
  // is computed from this, not from decrementing a counter, so background-tab
  // throttling of setInterval can never make it drift or jump.
  const countdownDeadlineRef = useRef<number>(0);
  // Guards against calling onLogout() twice (interval tick + visibility re-sync).
  const logoutFiredRef = useRef(false);
  // Holds the latest onLogout. The Dashboard passes an inline arrow whose
  // identity changes every render; keeping it in a ref lets the countdown
  // effect ignore those re-renders so the countdown is NEVER reset mid-way
  // by an unrelated parent re-render.
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  // Schedule the main idle timer (single source of truth).
  const scheduleIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      setShowModal(true);
    }, idleTimeout);
  }, [idleTimeout]);

  // ─── Reset idle timer on user activity ────────────────────────────────
  // CRITICAL: while the countdown modal is showing, generic activity (mouse
  // move, click, keydown...) must NOT dismiss it — the countdown keeps running
  // until the user explicitly clicks "Still Here", "Logout", or it expires.
  // Otherwise returning to the tab (which fires mousemove/click) instantly
  // closes the modal, which is the bug we're fixing.
  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showModalRef.current) {
      // Countdown in progress — never auto-dismiss on generic activity.
      // Only the explicit Still Here / Logout buttons dismiss it.
      return;
    }
    // Reset the main idle timer
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);

  // ─── Generate beep sound pulses ───────────────────────────────────────
  const playBeep = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.15);

      // Second pulse 200ms later
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(1108, ctx.currentTime + 0.2); // C#6
      gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc2.start(ctx.currentTime + 0.2);
      osc2.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio not supported — silently ignore
    }
  }, []);

  // ─── Countdown logic ──────────────────────────────────────────────────
  useEffect(() => {
    if (!showModal) {
      showModalRef.current = false;
      setIsBeeping(false);
      return;
    }

    showModalRef.current = true;
    logoutFiredRef.current = false;
    setIsBeeping(true);
    setCountdown(countdownSeconds);

    // Anchor the countdown to an absolute wall-clock deadline so it survives
    // background tabs: browsers throttle setInterval in hidden tabs (to ~1/min
    // or pause it entirely), so a naive decrement would either stall or burst
    // when the tab regains focus. Computing from Date.now() keeps it exact.
    countdownDeadlineRef.current = Date.now() + countdownSeconds * 1000;

    // Play beep immediately
    playBeep();

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((countdownDeadlineRef.current - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining > 0 && remaining < countdownSeconds) {
        playBeep();
      }
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        countdownRef.current = null;
        // Timeout expired — force logout (only once, even if the visibility
        // handler re-syncs at the same instant).
        if (!logoutFiredRef.current) {
          logoutFiredRef.current = true;
          onLogoutRef.current();
        }
      }
    };

    countdownRef.current = setInterval(tick, 1000);

    // When the user returns to this tab, immediately re-sync the countdown
    // from the deadline (covers the case where the interval was paused or
    // heavily throttled while hidden) instead of waiting for the next tick.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setIsBeeping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, playBeep, countdownSeconds]);

  // ─── Activity event listeners ─────────────────────────────────────────
  useEffect(() => {
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "wheel", "click"];

    const handler = () => resetIdleTimer();

    // Register all activity events
    events.forEach((ev) => document.addEventListener(ev, handler, { passive: true }));

    // Start the idle timer
    scheduleIdleTimer();

    return () => {
      events.forEach((ev) => document.removeEventListener(ev, handler));
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, [idleTimeout, scheduleIdleTimer, resetIdleTimer]);

  // ─── "Still Here" button handler ──────────────────────────────────────
  // The ONLY generic way to dismiss the countdown early — explicit user
  // action that restarts the whole idle cycle.
  const handleStillHere = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setShowModal(false);
    setCountdown(countdownSeconds);
    lastActivityRef.current = Date.now();
    // Restart the idle timer fresh
    scheduleIdleTimer();
  };

  // ─── "Logout" button handler ──────────────────────────────────────────
  const handleLogoutNow = () => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    onLogout();
  };

  // ─── Progress ring calculation ────────────────────────────────────────
  const progress = (countdown / countdownSeconds) * 100;
  const circumference = 2 * Math.PI * 56; // r=56
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const isUrgent = countdown <= 10;

  if (!showModal) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {/* Card */}
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl shadow-2xl border overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
          borderColor: "rgba(255,255,255,0.1)",
        }}
      >
        {/* Pulsing urgency glow */}
        {isUrgent && (
          <div
            className="absolute inset-0 rounded-2xl pointer-events-none animate-pulse"
            style={{
              boxShadow: "inset 0 0 40px rgba(239, 68, 68, 0.15)",
            }}
          />
        )}

        <div className="relative p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-500 ${
                isUrgent
                  ? "bg-red-500/20 animate-pulse"
                  : "bg-amber-500/15"
              }`}
            >
              <Clock
                className={`w-10 h-10 transition-colors duration-500 ${
                  isUrgent ? "text-red-400" : "text-amber-400"
                }`}
              />
            </div>
          </div>

          {/* Title */}
          <h2
            className="text-xl font-extrabold text-white mb-2 tracking-tight"
          >
            Session Expiring
          </h2>

          {/* Description */}
          <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto leading-relaxed">
            You've been inactive for a while. Your session will expire soon.
          </p>

          {/* Countdown Ring */}
          <div className="flex justify-center mb-6">
            <div className="relative w-32 h-32">
              {/* Background ring */}
              <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="5"
                />
                {/* Progress ring — uses style not attr for smooth CSS transition */}
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  fill="none"
                  stroke={isUrgent ? "#ef4444" : "#f59e0b"}
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  style={{
                    strokeDashoffset: strokeDashoffset,
                    transition: "stroke-dashoffset 0.7s linear",
                  }}
                />
              </svg>
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className={`text-4xl font-extrabold tracking-tight ${
                    isUrgent ? "text-red-400" : "text-white"
                  }`}
                >
                  {countdown}
                </span>
                <span className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-0.5">
                  seconds
                </span>
              </div>
            </div>
          </div>

          {/* Beep indicator */}
          {isBeeping && (
            <div className="flex items-center justify-center gap-1.5 mb-4">
              <span
                className={`inline-block w-2 h-2 rounded-full animate-ping ${
                  isUrgent ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">
                {isUrgent ? "⚠️ Beeping" : "Sound alert"}
              </span>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleStillHere}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-[1.03] active:scale-95"
              style={{
                background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "#fff",
                boxShadow: "0 4px 14px rgba(59, 130, 246, 0.35)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 14px rgba(59, 130, 246, 0.35)";
              }}
            >
              <RefreshCw className="w-4 h-4" />
              Still Here
            </button>

            <button
              onClick={handleLogoutNow}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 hover:scale-[1.03] active:scale-95"
              style={{
                background: isUrgent
                  ? "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)"
                  : "rgba(255,255,255,0.08)",
                color: isUrgent ? "#fff" : "#cbd5e1",
                border: isUrgent ? "none" : "1px solid rgba(255,255,255,0.1)",
              }}
              onMouseEnter={(e) => {
                if (!isUrgent) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isUrgent) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }
              }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


