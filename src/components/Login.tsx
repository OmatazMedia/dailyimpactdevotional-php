import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ArrowLeft,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { API_BASE } from "../config/api";

interface LoginProps {
  isDarkMode: boolean;
  onLoginSuccess?: (email: string) => void;
}

export default function Login({ isDarkMode, onLoginSuccess }: LoginProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isForgotMode, setIsForgotMode] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoverySent, setRecoverySent] = useState(false);

  // Password reset flow (/?admin/login?reset=TOKEN from the emailed link)
  const [resetToken, setResetToken] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get("reset") || "";
    } catch { return ""; }
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetDone, setResetDone] = useState(false);
  const [resetError, setResetError] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  
  // Step-by-step login flow
  const [loginStep, setLoginStep] = useState<"email" | "password">("email");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  // Set when the server returns a 403 IP-ban — replaces the form with a clear
  // "you are banned" notice instead of a generic error message.
  const [bannedMessage, setBannedMessage] = useState("");
  // When a failed attempt carries the server's countdown, remember that a
  // warning is owed so the amber "X attempts left" banner shows right away.
  const [showAttemptWarning, setShowAttemptWarning] = useState(false);

  // Banned IP flow: the login page checks the ban status on mount; a banned
  // visitor sees the banned screen + a 10-second countdown, then is sent back
  // to the homepage (never shown the login form again).
  const [banCountdown, setBanCountdown] = useState(10);

  useEffect(() => {
    // If this IP is banned, never show the login form — show the banned
    // screen and return to the homepage after the countdown.
    fetch(`${API_BASE}/admin.php?action=check`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { banned?: boolean; message?: string } | null) => {
        if (data?.banned) {
          setBannedMessage("You have been banned from accessing the admin area. Please contact the administrator.");
        }
      })
      .catch(() => {});
  }, []);

  // 10-second countdown → homepage. Runs only while the banned screen is shown.
  useEffect(() => {
    if (!bannedMessage) return;
    setBanCountdown(10);
    const t = setInterval(() => {
      setBanCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          navigate("/");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [bannedMessage, navigate]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (loginStep === "email") {
      // Email validation step
      if (!email.trim()) {
        setErrorMessage("Please enter your email address.");
        return;
      }
      if (!email.includes("@")) {
        setErrorMessage("Enter a valid email address.");
        return;
      }

      setIsLoading(true);

      try {
        const json = await api<{ success?: boolean; step?: string; attemptsRemaining?: number }>("/admin.php?action=login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, step: "email" }),
        });

        if (json.success && json.step === "password") {
          setAttemptsRemaining(json.attemptsRemaining || 3);
          setLoginStep("password");
          // The server only advances to the password step when the email is
          // registered, so we can truthfully tell the user it was recognised.
          setSuccessMessage("Email verified — enter your password.");
          setTimeout(() => setSuccessMessage(""), 2500);
        } else {
          setErrorMessage("Login failed.");
        }
        setIsLoading(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          // IP has been banned mid-attempt — go straight back to the homepage.
          // (A direct visit to the login page later shows the banned screen
          // with the countdown instead, via the mount-time ban check.)
          setBannedMessage(e.message || "You have been banned. Please contact the administrator.");
          navigate("/");
          return;
        } else {
          const msg = e instanceof ApiError ? e.message : (e instanceof Error ? `Could not reach server: ${e.message}` : "Network error");
          setErrorMessage(msg);
          // Surface the server's countdown ("2 attempts left → 1 → banned").
          const body = e instanceof ApiError ? (e.body as { attemptsRemaining?: number } | null) : null;
          if (body && typeof body.attemptsRemaining === "number") {
            setAttemptsRemaining(Math.max(0, body.attemptsRemaining));
            setShowAttemptWarning(true);
          }
        }
        setIsLoading(false);
      }
    } else {
      // Password validation step
      if (!password.trim()) {
        setErrorMessage("Please enter your password.");
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters.");
        return;
      }

      setIsLoading(true);

      try {
        const json = await api<{ success?: boolean; user?: { email: string; name: string } }>("/admin.php?action=login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, step: "password" }),
        });

        if (json.success && json.user) {
          setSuccessMessage(`Welcome, ${json.user.name || json.user.email}!`);
          setTimeout(() => {
            if (onLoginSuccess) onLoginSuccess(json.user!.email);
          }, 800);
        } else {
          setErrorMessage("Invalid email or password.");
          setIsLoading(false);
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          // IP has been banned mid-attempt — go straight back to the homepage.
          setBannedMessage(e.message || "You have been banned. Please contact the administrator.");
          navigate("/");
          return;
        } else {
          const msg = e instanceof ApiError ? e.message : (e instanceof Error ? `Could not reach server: ${e.message}` : "Network error");
          setErrorMessage(msg);
          // Same countdown surface as the email step.
          const body = e instanceof ApiError ? (e.body as { attemptsRemaining?: number } | null) : null;
          if (body && typeof body.attemptsRemaining === "number") {
            setAttemptsRemaining(Math.max(0, body.attemptsRemaining));
            setShowAttemptWarning(true);
          }
        }
        setIsLoading(false);
      }
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");
    if (!recoveryEmail.includes("@")) {
      setErrorMessage("Enter a valid email address.");
      return;
    }
    setIsLoading(true);
    try {
      const json = await api<{ success?: boolean; message?: string }>("/admin.php?action=forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: recoveryEmail }),
      });
      if (json.success) {
        setRecoverySent(true);
      } else {
        setErrorMessage(json.message || "Unable to send reset link.");
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? `Could not reach server: ${e.message}` : "Network error");
      // Backend returns 404 "Email not recognized..." for unregistered emails.
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit the new password from the emailed reset link
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError("");
    if (!resetToken) {
      setResetError("Missing reset token. Please use the link from your email.");
      return;
    }
    if (newPassword.length < 6) {
      setResetError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }
    setIsLoading(true);
    try {
      const json = await api<{ success?: boolean; message?: string }>("/admin.php?action=reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, password: newPassword }),
      });
      if (json.success) {
        setResetDone(true);
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setResetError(json.message || "Unable to reset password.");
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e instanceof Error ? `Could not reach server: ${e.message}` : "Network error");
      setResetError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const inputBase = `w-full py-3 pl-11 pr-4 text-sm border rounded-2xl focus:outline-none transition-all duration-200 ${
    isDarkMode
      ? "bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-teal-brand focus:ring-2 focus:ring-teal-brand/15"
      : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-teal-brand focus:ring-2 focus:ring-teal-brand/10"
  }`;

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">

      {/* Soft background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-teal-400/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-teal-600/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        className={`relative w-full max-w-sm rounded-3xl border p-8 shadow-2xl ${
          isDarkMode
            ? "bg-slate-900/95 border-slate-800 text-slate-100"
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className={`p-2 rounded-2xl ${isDarkMode ? "bg-white/90" : "bg-slate-100"}`}>
            <img
              src="/assets/images/dailyimpact.png"
              alt="Daily Impact Devotional"
              className="h-12 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="text-center">
            <h1 className="font-serif text-lg font-black tracking-tight text-slate-900 dark:text-white">
              {resetToken ? "Set New Password" : isForgotMode ? "Reset Password" : "Publisher Portal"}
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {resetToken
                ? "Choose a new password for your account"
                : isForgotMode ? "Enter your registered email to receive a reset link" : "Sign in to manage devotionals"}
            </p>
          </div>
        </div>

        {/* Feedback */}
        <AnimatePresence mode="wait">
          {errorMessage && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {errorMessage}
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              key="success"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2"
            >
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Countdown warning: "2 attempts left → 1 → banned" — rendered
            outside AnimatePresence so it can appear together with the error. */}
        {showAttemptWarning && !bannedMessage && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-4 p-3 rounded-xl border text-xs font-bold flex items-start gap-2 ${
              attemptsRemaining === 0
                ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>
              {attemptsRemaining === 0
                ? "⚠️ Final warning — you will be banned after this next failed attempt. Contact the administrator if this is a mistake."
                : attemptsRemaining === 1
                  ? "⚠️ 1 attempt left — you will be banned after that."
                  : `⚠️ ${attemptsRemaining} attempts left — you will be banned afterwards.`}
            </span>
          </motion.div>
        )}

        {/* ── BANNED SCREEN — short and direct: banned → contact admin ── */}
        {bannedMessage ? (
          <div className="py-2 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636M3 8l3-3m-3 3l3 3m12-6l3 3m-3-3l3-3M9 21h6" />
              </svg>
            </div>
            <h2 className="font-serif text-lg font-black text-rose-600 dark:text-rose-400">
              You have been banned
            </h2>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 max-w-[240px] mx-auto">
              {bannedMessage}
            </p>
            <div className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Returning to the homepage in {banCountdown}s…
            </div>
            <button
              type="button"
              onClick={() => navigate("/")}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
            >
              Go to homepage now
            </button>
          </div>
        ) : resetToken ? (
          <div className="space-y-4">
            {resetDone ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Password Updated</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Your password has been reset. You can now sign in with your new password.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setResetToken("");
                    setResetDone(false);
                    setNewPassword("");
                    setConfirmPassword("");
                    // Drop the ?reset=... param so refreshing doesn't re-show the form
                    try { window.history.replaceState({}, document.title, window.location.pathname); } catch {}
                  }}
                  className="w-full py-2 text-xs font-bold text-teal-brand hover:underline flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                {resetError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {resetError}
                  </div>
                )}
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="New password (min 6 characters)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    className={`${inputBase} pr-11`}
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="new-password"
                    className={`${inputBase} pr-11`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-2xl bg-teal-brand hover:bg-teal-brand/90 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <><span>Reset Password</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}
          </div>
        ) : !isForgotMode ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">

            {/* Email Step */}
            {loginStep === "email" && (
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  className={inputBase}
                />
              </div>
            )}

            {/* Password Step */}
            {loginStep === "password" && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setLoginStep("email");
                    setPassword("");
                    setErrorMessage("");
                  }}
                  className="text-[11px] text-slate-400 hover:text-teal-brand font-semibold flex items-center gap-1 mb-2 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Back to email
                </button>

                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    disabled={true}
                    className={`${inputBase} opacity-70`}
                  />
                </div>

                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    autoComplete="current-password"
                    className={`${inputBase} pr-11`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {attemptsRemaining > 0 && attemptsRemaining <= 2 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold text-center">
                    {attemptsRemaining} attempt{attemptsRemaining !== 1 ? 's' : ''} remaining before IP ban
                  </p>
                )}
              </>
            )}

            {/* Forgot link */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsForgotMode(true)}
                className="text-[11px] font-bold text-teal-brand hover:underline"
              >
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-2xl bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-teal-brand/20"
            >
              {isLoading ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Signing in...</>
              ) : (
                <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>

          </form>
        ) : (

          /* ── FORGOT PASSWORD ── */
          <div className="space-y-4">
            {!recoverySent ? (
              <form onSubmit={handleRecoverySubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="email"
                    placeholder="Your registered email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    disabled={isLoading}
                    className={inputBase}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-2xl bg-teal-brand hover:bg-teal-brand/90 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <><span>Send Reset Link</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            ) : (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">Check your inbox</p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Reset instructions sent to <strong className="text-slate-600 dark:text-slate-300">{recoveryEmail}</strong>
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setIsForgotMode(false); setRecoverySent(false); setRecoveryEmail(""); setErrorMessage(""); }}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
