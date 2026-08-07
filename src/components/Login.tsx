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
  ShieldCheck,
  Smartphone,
  KeyRound,
} from "lucide-react";
import { api, ApiError } from "../lib/api";
import { API_BASE } from "../config/api";
import OtpCodeInput, { OtpStatus } from "./OtpCodeInput";

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

  // Secure-all flow (/?admin/login?secureall=TOKEN from the login-notification
  // email): "This wasn't me — log out all sessions" button.
  const [secureAllToken, setSecureAllToken] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get("secureall") || "";
    } catch { return ""; }
  });
  const [secureAllMsg, setSecureAllMsg] = useState("");
  const [secureAllError, setSecureAllError] = useState("");
  
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

  // ── Two-Factor Authentication (third step, after the password) ──
  // Set when the server returns twofaRequired: the login is NOT complete until
  // a live code from the authenticator app / email / a backup code is verified.
  const [twofaRequired, setTwofaRequired] = useState(false);
  const [twofaMethods, setTwofaMethods] = useState<string[]>([]);
  const [twofaPendingToken, setTwofaPendingToken] = useState("");
  const [twofaBackupRemaining, setTwofaBackupRemaining] = useState(0);
  const [twofaMethod, setTwofaMethod] = useState<"app" | "email">("app");
  const [twofaUseBackup, setTwofaUseBackup] = useState(false);
  const [twofaCode, setTwofaCode] = useState("");
  const [twofaStatus, setTwofaStatus] = useState<OtpStatus>("idle");
  const [twofaEmailSent, setTwofaEmailSent] = useState(false);
  const [twofaError, setTwofaError] = useState("");
  const [twofaSuccessMsg, setTwofaSuccessMsg] = useState("");
  const [backupCodeInput, setBackupCodeInput] = useState("");

  // Deep-link from the login-notification email's "Reset my password" button
  // (/admin/login?mode=forgot&email=...): open the forgot-password form with
  // the account email pre-filled. The params stay in the URL (App.tsx uses
  // them to keep this page reachable even when a session is active), and the
  // prefill is idempotent, so a refresh simply re-fills the form. Never
  // touches a real ?reset=TOKEN link from the reset email.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") !== "forgot") return;
    setIsForgotMode(true);
    const email = params.get("email") || "";
    if (email) setRecoveryEmail(email);
  }, []);

  useEffect(() => {
    if (!secureAllToken) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/admin.php?action=logout-all-sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: secureAllToken }),
        });
        const json = await res.json() as { success?: boolean; message?: string };
        if (json.success) {
          setSecureAllMsg(json.message || "All admin sessions have been logged out.");
          const url = new URL(window.location.href);
          url.searchParams.delete("secureall");
          window.history.replaceState({}, "", url.toString());
        } else {
          setSecureAllError(json.message || "This security link is invalid or has expired.");
        }
      } catch {
        setSecureAllError("Could not reach the server. If this was not you, change your password immediately.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secureAllToken]);

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
          // The email is registered — the ban countdown warning is no longer
          // owed, so clear it. (If they keep submitting wrong emails the
          // server keeps returning the remaining attempts and the warning
          // returns — the countdown only stops when a known email is entered.)
          setShowAttemptWarning(false);
          setAttemptsRemaining(3);
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
        const json = await api<{
          success?: boolean;
          twofaRequired?: boolean;
          pendingToken?: string;
          twofa?: { methods?: string[]; backupRemaining?: number };
          user?: { email: string; name: string };
        }>("/admin.php?action=login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, step: "password" }),
        });

        if (json.success && json.twofaRequired) {
          // Password was correct but this account has 2FA — show the modal.
          const methods = json.twofa?.methods ?? [];
          setTwofaRequired(true);
          setTwofaMethods(methods);
          setTwofaPendingToken(json.pendingToken || "");
          setTwofaBackupRemaining(json.twofa?.backupRemaining ?? 0);
          setTwofaMethod(methods.includes("email") && !methods.includes("app") ? "email" : "app");
          setTwofaUseBackup(false);
          setTwofaCode("");
          setTwofaStatus("idle");
          setTwofaEmailSent(false);
          setTwofaError("");
          setTwofaSuccessMsg("");
          setShowAttemptWarning(false);
          setAttemptsRemaining(3);
          setIsLoading(false);
        } else if (json.success && json.user) {
          // Full login succeeded — drop any lingering ban warning state.
          setShowAttemptWarning(false);
          setAttemptsRemaining(3);
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

  // ── 2FA verification handlers ──────────────────────────────────────────────

  // Verify the submitted code (app / email / backup) against the pending login.
  const handleTwofaVerify = async (code: string) => {
    if (!code || code.length < 6) return;
    setTwofaStatus("verifying");
    setTwofaError("");
    try {
      const json = await api<{
        success?: boolean;
        user?: { email: string; name: string };
        backupUsed?: boolean;
        backupRemaining?: number;
      }>("/2fa.php?action=verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: twofaPendingToken,
          method: twofaUseBackup ? "backup" : twofaMethod,
          code: code.trim(),
        }),
      });
      if (json.success && json.user) {
        setTwofaStatus("success");
        const remaining = json.backupRemaining ?? 0;
        setTwofaBackupRemaining(remaining);
        setTwofaSuccessMsg(
          json.backupUsed
            ? `Backup code accepted — ${remaining} remaining. Consider generating a new set in Settings → Security.`
            : `Welcome back, ${json.user.name || json.user.email}!`
        );
        setErrorMessage("");
        setTimeout(() => {
          setTwofaRequired(false);
          if (onLoginSuccess) onLoginSuccess(json.user!.email);
        }, 1100);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setBannedMessage(e.message || "You have been banned. Please contact the administrator.");
        navigate("/");
        return;
      }
      setTwofaStatus("error");
      const msg = e instanceof ApiError ? e.message : "Verification failed. Please try again.";
      setTwofaError(msg);
      setTwofaSuccessMsg("");
      // Clear the boxes so they can retry (the shake plays on the error frame).
      setTimeout(() => {
        setTwofaCode("");
        setTwofaStatus("idle");
      }, 750);
    }
  };

  // Send an email OTP for the pending 2FA login.
  const handleSendLoginOtp = async () => {
    setTwofaError("");
    setTwofaSuccessMsg("");
    try {
      const json = await api<{ success?: boolean; message?: string }>("/2fa.php?action=send-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: twofaPendingToken }),
      });
      if (json.success) {
        setTwofaEmailSent(true);
        setSuccessMessage("Verification code sent — check your inbox (and spam folder).");
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        setTwofaError(json.message || "Could not send the code.");
      }
    } catch (e) {
      setTwofaError(e instanceof ApiError ? e.message : "Could not send the code. Please try again.");
    }
  };

  // Submit a backup/recovery code (shares the verify pipeline).
  const handleBackupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCodeInput.trim()) return;
    await handleTwofaVerify(backupCodeInput.trim());
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

        {/* Secure-all result (from the login-notification email button) */}
        {secureAllError && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {secureAllError}
          </motion.div>
        )}
        {secureAllMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2"
          >
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            {secureAllMsg}
          </motion.div>
        )}

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
        ) : twofaRequired ? (

          /* ── TWO-FACTOR VERIFICATION ── */
          <div className="space-y-4">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-2xl bg-teal-brand/10 text-teal-brand flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-base font-black text-slate-900 dark:text-white">
                Two-Factor Verification
              </h2>
              <p className="text-[11px] text-slate-400 font-semibold leading-relaxed">
                {twofaUseBackup
                  ? "Enter one of your backup codes to sign in"
                  : twofaMethod === "app"
                    ? "Enter the 6-digit code from your authenticator app"
                    : "Enter the code sent to your email"}
              </p>
            </div>

            {twofaError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {twofaError}
              </div>
            )}
            {twofaSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                {twofaSuccessMsg}
              </div>
            )}

            {/* Method switcher — only when both methods are active */}
            {!twofaUseBackup && twofaMethods.length > 1 && (
              <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => { setTwofaMethod("app"); setTwofaCode(""); setTwofaStatus("idle"); setTwofaError(""); }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                    twofaMethod === "app"
                      ? "bg-white dark:bg-slate-800 text-teal-brand shadow-sm"
                      : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <Smartphone className="w-3 h-3" /> Authenticator
                </button>
                <button
                  type="button"
                  onClick={() => { setTwofaMethod("email"); setTwofaCode(""); setTwofaStatus("idle"); setTwofaError(""); }}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 ${
                    twofaMethod === "email"
                      ? "bg-white dark:bg-slate-800 text-teal-brand shadow-sm"
                      : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <Mail className="w-3 h-3" /> Email
                </button>
              </div>
            )}

            {!twofaUseBackup && (
              <>
                {twofaMethod === "email" && !twofaEmailSent && (
                  <button
                    type="button"
                    onClick={handleSendLoginOtp}
                    disabled={twofaStatus === "verifying"}
                    className="w-full py-3 rounded-2xl bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.98] text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-teal-brand/20"
                  >
                    <Mail className="w-4 h-4" /> Send code to my email
                  </button>
                )}

                {(twofaMethod === "app" || twofaEmailSent) && (
                  <OtpCodeInput
                    value={twofaCode}
                    onChange={setTwofaCode}
                    onComplete={handleTwofaVerify}
                    status={twofaStatus}
                    dark={isDarkMode}
                    disabled={twofaStatus === "verifying"}
                  />
                )}
              </>
            )}

            {/* Backup code entry */}
            {twofaUseBackup && (
              <form onSubmit={handleBackupSubmit} className="space-y-3">
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Backup code (e.g. 3F9A2C11)"
                    value={backupCodeInput}
                    onChange={(e) => setBackupCodeInput(e.target.value.toUpperCase())}
                    disabled={twofaStatus === "verifying"}
                    autoFocus
                    autoComplete="off"
                    className={`${inputBase} uppercase font-mono tracking-widest`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={twofaStatus === "verifying"}
                  className="w-full py-3 rounded-2xl bg-teal-brand hover:bg-teal-brand/90 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {twofaStatus === "verifying" ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><span>Verify Backup Code</span><ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            )}

            {/* Toggle to backup entry */}
            <button
              type="button"
              onClick={() => { setTwofaUseBackup(!twofaUseBackup); setTwofaError(""); setTwofaCode(""); setBackupCodeInput(""); setTwofaStatus("idle"); }}
              className="w-full py-1.5 text-[11px] font-bold text-slate-400 hover:text-teal-brand transition-colors"
            >
              {twofaUseBackup ? "Use my authenticator app / email code instead" : "Use a backup code instead"}
            </button>

            {twofaUseBackup && twofaMethods.length > 0 && (
              <p className="text-[10px] text-center text-slate-400 font-semibold">
                Backup codes remaining: <strong className="text-amber-500">{twofaBackupRemaining}</strong>
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setTwofaRequired(false);
                setLoginStep("email");
                setPassword("");
                setTwofaCode("");
                setTwofaError("");
                setTwofaSuccessMsg("");
                setTwofaUseBackup(false);
              }}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
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
                    // Going back to edit the email also clears the countdown
                    // banner — it reappears on the next failed attempt.
                    setShowAttemptWarning(false);
                    setAttemptsRemaining(3);
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
