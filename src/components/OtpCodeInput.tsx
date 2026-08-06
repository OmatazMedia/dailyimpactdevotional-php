import React, { useEffect, useRef } from "react";

export type OtpStatus = "idle" | "verifying" | "success" | "error";

interface OtpCodeInputProps {
  length?: number;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (code: string) => void;
  status?: OtpStatus;
  disabled?: boolean;
  dark?: boolean;
  autoFocus?: boolean;
}

/**
 * Reusable 6-digit code input: separate digit boxes that auto-advance, accept
 * paste, verify automatically when the last digit is entered, flash green on
 * success and shake red on error.
 */
export default function OtpCodeInput({
  length = 6,
  value,
  onChange,
  onComplete,
  status = "idle",
  disabled = false,
  dark = false,
  autoFocus = true,
}: OtpCodeInputProps) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus the first box on mount (or when a fresh entry starts after an error).
  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (status === "error" && value === "" && autoFocus) {
      inputs.current[0]?.focus();
    }
  }, [status, value, autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const digit = e.target.value.replace(/\D/g, "");
    if (!digit) return;
    const next = value.split("");
    next[idx] = digit.slice(-1);
    const newVal = next.join("").slice(0, length);
    onChange(newVal);
    if (idx < length - 1) {
      inputs.current[idx + 1]?.focus();
    }
    if (newVal.length === length && status !== "verifying" && status !== "success") {
      onComplete?.(newVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace" && value[idx] === "" && idx > 0) {
      e.preventDefault();
      const next = value.split("");
      next[idx - 1] = "";
      onChange(next.join(""));
      inputs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    onChange(text);
    if (text.length === length) {
      onComplete?.(text);
    } else {
      inputs.current[Math.min(text.length, length - 1)]?.focus();
    }
  };

  const boxClass = (filled: boolean) => {
    const base = "w-10 h-12 md:w-11 md:h-12 rounded-xl border-2 text-center text-xl font-black font-mono focus:outline-none transition-all duration-150 selection:bg-transparent";
    const neutral = dark
      ? "bg-slate-950 border-slate-700 text-white focus:border-teal-brand"
      : "bg-white border-slate-300 text-slate-900 focus:border-teal-brand";
    if (status === "success") {
      return `${base} border-emerald-400 dark:border-emerald-500 text-emerald-600 dark:text-emerald-400 otp-flash-green`;
    }
    if (status === "error") {
      return `${base} border-rose-500 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30`;
    }
    if (status === "verifying") {
      return `${base} ${dark ? "border-amber-400/60 bg-slate-950 text-white" : "border-amber-400/60 bg-white text-slate-900"}`;
    }
    return `${base} ${filled ? "border-teal-brand/60" : ""} ${neutral}`;
  };

  return (
    <div
      className={`flex justify-center gap-1.5 md:gap-2 ${status === "error" ? "otp-shake" : ""}`}
      role="group"
      aria-label="Verification code"
    >
      {Array.from({ length }).map((_, idx) => (
        <input
          key={idx}
          ref={(el) => { inputs.current[idx] = el; }}
          value={value[idx] ?? ""}
          onChange={(e) => handleChange(e, idx)}
          onKeyDown={(e) => handleKeyDown(e, idx)}
          onPaste={handlePaste}
          onClick={(e) => (e.target as HTMLInputElement).select()}
          disabled={disabled || status === "success" || status === "verifying"}
          inputMode="numeric"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={1}
          aria-label={`Digit ${idx + 1}`}
          className={boxClass(!!value[idx])}
        />
      ))}
    </div>
  );
}
