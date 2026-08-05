import React, { useEffect, useState } from "react";
import {
  X, Heart, Copy, Check, CreditCard, Landmark,
  ChevronDown, ChevronUp, Lock, User, Gift, AlertTriangle
} from "lucide-react";

/**
 * Recognizable payment-brand badges shown on the Pay Online tab. Inline SVG
 * so we ship zero new dependencies — they communicate "secure card payment"
 * without naming the underlying gateway processor.
 */
const PAYMENT_BRANDS: { label: string; svg: React.ReactNode }[] = [
  {
    label: "Visa",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#1A1F71" />
        <path d="M19.6 22.4h-3.4l2.9-12.8h3.4l-2.9 12.8zm15.2-8.3c-.2-1-1.3-2.2-3.7-2.2-3.5 0-5.9 1.8-5.9 4.4 0 1.9 1.7 3 3.1 3.6 1.4.6 1.9 1 1.9 1.5 0 .9-1.2 1.3-2.3 1.3-1.5 0-2.3-.2-3.6-.8l-.5-.2-.6 3c.9.4 2.5.8 4.1.8 3.8 0 6.3-1.8 6.4-4.6 0-1.5-.9-2.7-3-3.7-1.3-.6-2-1-2-1.6 0-.5.7-1.1 2-1.1 1.2 0 2.1.3 2.7.5l.3.2.7-2.8zm8.4-4.5h-2.7c-1 0-1.8.3-2.1 1.4l-6.2 11.4h3.9l.8-2h4.4l.4 2h3.4l-2.5-12.8zm-3.7 8.3l1.8-4.4 1 4.4h-2.8z" fill="#fff" />
      </svg>
    ),
  },
  {
    label: "Mastercard",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB" />
        <circle cx="19" cy="16" r="9" fill="#EB001B" opacity="0.9" />
        <circle cx="29" cy="16" r="9" fill="#F79E1B" opacity="0.9" />
        <path d="M24 9.5a9 9 0 010 13 9 9 0 010-13z" fill="#FF5F00" />
      </svg>
    ),
  },
  {
    label: "American Express",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#2E77BC" />
        <text x="24" y="20" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#fff" fontFamily="Arial, sans-serif">AMEX</text>
      </svg>
    ),
  },
  {
    label: "Verve",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#7C2D92" />
        <text x="24" y="20" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#fff" fontFamily="Arial, sans-serif">verve</text>
      </svg>
    ),
  },
  {
    label: "Google Pay",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB" />
        <path d="M30.5 9h.9v1h-.9V9zm-5.6 0c-.4.3-.6.8-.6 1.3v1.4h1V9.6c.2-.2.5-.3.8-.2.3.1.5.3.5.6v1.5h1v-1.6c0-.6-.3-1.1-.9-1.3-.6-.2-1.3-.1-1.8.1z" fill="#4285F4" />
        <path d="M28 9.5a3.5 3.5 0 100 7 3.4 3.4 0 001.8-.5v-1.6h-1.8v1.2c-.5.3-1.1.3-1.6 0-.5-.3-.8-.9-.8-1.5s.3-1.2.8-1.5c.5-.3 1.1-.3 1.6 0V14h1.8v-1.5h-2.3c-.4-.1-.4-.7 0-.8l2.3-1V9.6l-.1-.1c-.6-.6-1.4-.8-2.2-.5-.3.1-.5.3-.6.5z" fill="#EA4335" />
        <path d="M30.2 14.5c.9.2 1.8.1 2.6-.3V15.7c-.7.3-1.5.4-2.2.3.2.7.4 1.4.6 2.1h-.8c-.1-.7-.4-1.4-.7-2.1 0 .7-.1 1.4-.2 2.1h-.8c.1-.7.1-1.4.3-2.1-.2.7-.4 1.4-.5 2.1h-.8c.2-.7.5-1.4.8-2.1-.3.7-.6 1.4-.8 2.1h-.8c.1-.7.2-1.4.4-2.1-.1.7-.3 1.4-.4 2.1h-.9c.3-.7.6-1.4 1-2.1-.3.7-.7 1.4-1 2.1v.1c-.4-1.1-.8-2.3-1.1-3.5l.1-.1h.8c.4 1.1.9 2.2 1.5 3.2.1-.5.2-1 .3-1.5.1-.6.2-1.2.4-1.7h1.5c.1.6.3 1.2.6 1.7.4.8.8 1.5 1.3 2.2-.2-.7-.3-1.5-.3-2.2v-.2c-.1-.6.2-1.2.7-1.4.3-.2.7-.2 1-.1.5.1.8.5.9 1z" fill="#FBBC04" />
        <path d="M30 9c.5.3.8.7.9 1.2-.7-.2-1.5-.2-2.2 0 .2-.5.7-.9 1.3-1.2z" fill="#4285F4" />
      </svg>
    ),
  },
  {
    label: "Apple Pay",
    svg: (
      <svg viewBox="0 0 48 32" className="h-3 w-auto" aria-hidden="true">
        <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E7EB" />
        <path d="M19 9.5c-.2 1.2.3 2.4 1 3.1.6.6 1.5 1 1.5 1s-.9 1.5-1 2c-.1.4-.1.6-.4 1-.5.9-1.5 1.6-2.6 1.6-1 0-1.3-.6-2.5-.6-1.1 0-1.6.6-2.6.6-1.1 0-2-.6-2.6-1.6-1.6-2.2-1.8-5.4-.6-7.2.8-1.3 2.2-2.1 3.6-2.1 1.2 0 2.1.6 3.1.6.9 0 2.2-.7 3.3-.7 1.6 0 2.6.8 3.5 1.9-1.5.9-2.1 2.4-2 3.8zM25.7 9.7c.5-1.6 2.4-2.7 4-2.4.3 0 .5.4.4.7-.1.3-1.5 2.3-1.6 4.1 0 1.9 1.7 3.3 2.8 3.5h.2c-.2.7-1.9 1.4-3.2 1.4-1.2 0-2.1-.7-3.1-.7-1 0-2 .6-2.8.6-1.4 0-2.5-.9-3.5-1.8-2-1.8-3.4-5.2-2.4-7.9.5-1.4 1.7-2.5 3.2-2.6.8 0 1.6.4 2.3.4.7 0 1.6-.5 2.5-.6.7-.1 1.6-.1 2.4.2.3.4.5.9.7 1.4-.8.3-2.2.9-2.5 2.3z" fill="#000" />
      </svg>
    ),
  },
];
import { API_BASE } from "../config/api";
import { motion, AnimatePresence } from "motion/react";
import { BankAccount, parseBankAccounts } from "../lib/bankAccounts";

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onDonationComplete: (info: { name: string; amount: number; currency: string; anonymous: boolean }) => void;
}

type Settings = {
  donation_message?: string;
  default_currency?: string;
  paystack_enabled?: string;
  flutterwave_enabled?: string;
  gateway_currency_map?: string;
  bank_transfer_enabled?: string;
  bank_accounts?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_name?: string;
};

type Method = "online" | "bank";

const CURRENCIES = ["USD", "NGN", "GBP"] as const;
const CURRENCY_SYMBOL: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£" };

function parseGatewayMap(raw: unknown): Record<string, string> {
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed as Record<string, string>;
    } catch { /* fall through */ }
  }
  return {};
}

export default function DonateModal({ isOpen, onClose, isDarkMode, onDonationComplete }: DonateModalProps) {
  // Payment method — "Pay Online" is the default selection.
  const [method, setMethod] = useState<Method>("online");

  const [currency, setCurrency] = useState<"USD" | "NGN" | "GBP">("NGN");
  const [amount, setAmount] = useState<string>("5000");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  // Bank tab: show the first two accounts, then reveal the rest on demand.
  const [showAllAccounts, setShowAllAccounts] = useState(false);

  // Donor details + anonymous checkbox. When "anonymous" is ticked the
  // personal fields are ignored entirely (name/email/phone are not required).
  const [form, setForm] = useState({ name: "", email: "", phone: "", anonymous: false });
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({});

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Settings | null) => {
        if (data) {
          setSettings(data);
          const cur = (data.default_currency || "NGN") as "USD" | "NGN" | "GBP";
          setCurrency(cur);
          setAmount(presets[cur][2]);
        }
      })
      .catch(() => {});
    // Reset per-open state
    setMethod("online");
    setBankOpen(false);
    setShowAllAccounts(false);
    setForm({ name: "", email: "", phone: "", anonymous: false });
    setErrors({});
  }, [isOpen]);

  const presets = {
    USD: ["10", "25", "50", "100", "250"],
    NGN: ["5000", "10000", "25000", "50000", "100000"],
    GBP: ["10", "20", "50", "100", "200"],
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const activeAmount = customAmount || amount;
  const currentPresets = presets[currency];

  // Bank accounts (from the admin-configured list) grouped by the selected currency.
  const bankAccounts = parseBankAccounts(settings);
  const matchingAccounts = bankAccounts.filter(a => a.currency === currency);
  const otherAccounts = bankAccounts.filter(a => a.currency !== currency);
  const hasBankAccounts = settings.bank_transfer_enabled !== "false" && bankAccounts.length > 0;

  // Per-currency payment gateway mapping (set in the admin dashboard).
  const gatewayMap = parseGatewayMap(settings.gateway_currency_map);
  const gatewayFor = (cur: string): "paystack" | "flutterwave" | "none" => {
    const mapped = gatewayMap[cur];
    if (mapped === "paystack" && settings.paystack_enabled === "true") return "paystack";
    if (mapped === "flutterwave" && settings.flutterwave_enabled === "true") return "flutterwave";
    // Graceful fallback to whichever gateway is enabled
    if (settings.paystack_enabled === "true") return "paystack";
    if (settings.flutterwave_enabled === "true") return "flutterwave";
    return "none";
  };
  const gateway = gatewayFor(currency);

  const renderBankAccount = (acc: BankAccount) => {
    const copyKey = (field: string) => `${acc.id}-${field}`;
    const copyRow = (label: string, value: string, key: string) =>
      value ? (
        <div key={key} className="flex justify-between items-center py-1 border-b border-slate-200/40 dark:border-slate-700/40 last:border-0 gap-3">
          <span className="text-slate-400 shrink-0">{label}</span>
          <button
            type="button"
            onClick={() => handleCopy(value, copyKey(key))}
            className="font-mono font-bold flex items-center gap-1 hover:text-teal-brand text-right break-all text-slate-700 dark:text-slate-200"
          >
            {value}
            {copiedText === copyKey(key)
              ? <Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
              : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-teal-brand shrink-0" />}
          </button>
        </div>
      ) : null;

    return (
      <div key={acc.id} className={`p-3 rounded-xl border ${isDarkMode ? "bg-slate-800/40 border-slate-700/60" : "bg-amber-50/40 border-amber-200/50"}`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-teal-brand/10 text-teal-brand border border-teal-brand/30 shrink-0">{acc.currency}</span>
          <span className="text-xs font-bold truncate">{acc.bankName || "Bank Account"}</span>
        </div>
        <div className="space-y-0 text-xs">
          {copyRow("Account Number", acc.accountNumber, "acc")}
          {acc.accountName ? (
            <div className="flex justify-between items-center py-1 border-b border-slate-200/40 dark:border-slate-700/40 last:border-0 gap-3">
              <span className="text-slate-400 shrink-0">Account Name</span>
              <span className="font-semibold text-right break-all max-w-[220px]">{acc.accountName}</span>
            </div>
          ) : null}
          {copyRow("SWIFT / BIC", acc.swift, "swift")}
          {copyRow("IBAN", acc.iban, "iban")}
          {copyRow("Routing / Sort Code", acc.routing, "routing")}
          {acc.internationalFormat ? (
            <div className="flex justify-between items-center py-1 border-b border-slate-200/40 dark:border-slate-700/40 last:border-0 gap-3">
              <span className="text-slate-400 shrink-0">International Format</span>
              <span className="font-mono font-semibold text-right break-all max-w-[220px]">{acc.internationalFormat}</span>
            </div>
          ) : null}
          {acc.extraDetails ? (
            <p className="pt-1.5 text-[11px] text-slate-500 leading-relaxed">{acc.extraDetails}</p>
          ) : null}
        </div>
      </div>
    );
  };

  // Strip HTML-ish content and trim — mirrors the server-side sanitization.
  const sanitize = (s: string) => s.replace(/<[^>]*>/g, "").trim();

  const validate = (): boolean => {
    const next: { name?: string; email?: string; phone?: string } = {};
    if (!form.anonymous) {
      if (sanitize(form.name).length < 2) next.name = "Please enter your full name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitize(form.email))) next.email = "Please enter a valid email address.";
      const digits = form.phone.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) next.phone = "Please enter a valid phone number.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitDonation = async () => {
    if (loading) return;
    if (!validate()) return;

    const cleanName = sanitize(form.name);
    const cleanEmail = sanitize(form.email).toLowerCase();
    const cleanPhone = form.phone.replace(/[^\d+()\-\s]/g, "").trim();

    if (method === "online" && gateway === "none") {
      setErrors({ email: "Online payment is not configured for this currency yet — please use Bank Transfer." });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/donations.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(activeAmount || 0),
          currency,
          email: form.anonymous ? "" : cleanEmail,
          name: form.anonymous ? "" : cleanName,
          phone: form.anonymous ? "" : cleanPhone,
          provider: gateway,
          status: "success",
          is_anonymous: form.anonymous,
          reference: `DID-${Date.now()}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to save donation");
      await res.json();

      // Hand off to the App-level celebration page.
      onDonationComplete({
        name: form.anonymous ? "" : cleanName,
        amount: Number(activeAmount || 0),
        currency,
        anonymous: form.anonymous,
      });
    } catch {
      setErrors({ email: "Unable to create your donation request right now. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const inputBase = `w-full py-2.5 px-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
    isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500" : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
  }`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 md:p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !loading && onClose()} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Wider, scrollable modal so content never overlaps the action buttons */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={`relative w-full max-w-2xl rounded-2xl overflow-hidden border shadow-2xl z-10 flex flex-col max-h-[92vh] ${
              isDarkMode ? "bg-slate-900 text-slate-100 border-slate-800" : "bg-white text-slate-800 border-slate-200"
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 via-amber-400 to-amber-500 z-10" />

            {/* Header (sticky) */}
            <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${
              isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50"
            }`}>
              <div className="flex items-center gap-2">
                <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                <h3 className="text-xl font-bold font-serif">Support the Devotional</h3>
              </div>
              <button onClick={() => !loading && onClose()} className={`p-2 rounded-full ${isDarkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}><X className="w-5 h-5" /></button>
            </div>

            {/* Scrollable body */}
            <div className="p-6 md:p-8 space-y-6 overflow-y-auto">
              <p className={`text-sm ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{settings.donation_message || "Thank you for your generosity."}</p>

              {/* ── 1. Payment method selector (Pay Online default) ─────────── */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">How would you like to give?</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setMethod("online")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
                      method === "online"
                        ? "bg-white dark:bg-slate-700 text-teal-brand shadow-sm"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <CreditCard className="w-4 h-4" /> Pay Online
                  </button>
                  <button
                    type="button"
                    onClick={() => setMethod("bank")}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 text-sm font-semibold rounded-lg transition-all ${
                      method === "bank"
                        ? "bg-white dark:bg-slate-700 text-teal-brand shadow-sm"
                        : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    <Landmark className="w-4 h-4" /> Bank Transfer
                  </button>
                </div>
              </div>

              {method === "online" && (
                <>
                  {/* ── 2a. Currency + gateway ─────────────────────────────── */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Select Currency</label>
                    <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                      {CURRENCIES.map(curr => (
                        <button
                          key={curr}
                          onClick={() => { setCurrency(curr); setAmount(presets[curr][2]); setCustomAmount(""); }}
                          className={`flex-1 py-2 text-sm font-semibold rounded-lg ${currency === curr ? "bg-white dark:bg-slate-700 text-teal-brand shadow-sm" : "text-slate-500"}`}
                        >{curr}</button>
                      ))}
                    </div>
                    {gateway !== "none" ? (
                      <>
                        <p className={`mt-2 text-[11px] font-bold flex items-center gap-1.5 ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                          <Lock className="w-3.5 h-3.5 text-teal-brand" />
                          Your transaction is secure and fully protected.
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          {PAYMENT_BRANDS.map(brand => (
                            <span
                              key={brand.label}
                              title={brand.label}
                              className={`inline-flex items-center rounded-md border px-1.5 py-1 opacity-80 hover:opacity-100 transition-opacity ${isDarkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}
                            >
                              {brand.svg}
                            </span>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-[11px] font-bold flex items-center gap-1.5 text-amber-500">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Online payment isn't configured for {currency} yet — please use Bank Transfer.
                      </p>
                    )}
                  </div>

                  {/* ── 3a. Amounts ───────────────────────────────────────── */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Select Amount</label>
                    <div className="grid grid-cols-5 gap-2">
                      {currentPresets.map(preset => (
                        <button
                          key={preset}
                          onClick={() => { setAmount(preset); setCustomAmount(""); }}
                          className={`py-2 px-1 text-center text-sm font-semibold rounded-lg border ${
                            amount === preset && !customAmount
                              ? "border-teal-brand bg-teal-brand/10 text-teal-brand"
                              : isDarkMode ? "border-slate-800 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
                          }`}
                        >{CURRENCY_SYMBOL[currency]}{Number(preset).toLocaleString()}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Or Enter Custom Amount</label>
                    <input type="number" placeholder="Other amount" value={customAmount}
                      onChange={(e) => { setCustomAmount(e.target.value); setAmount(""); }}
                      className={`${inputBase} ${errors.email && errors.email.includes("Online payment") ? "border-amber-400" : ""}`} />
                  </div>
                </>
              )}

              {method === "bank" && (
                <>
                  {/* ── 2b. Bank transfer accordion ───────────────────────── */}
                  <div className={`rounded-xl border overflow-hidden ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
                    <button
                      type="button"
                      onClick={() => setBankOpen(!bankOpen)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors ${
                        isDarkMode ? "hover:bg-slate-800 bg-slate-950/40" : "hover:bg-slate-50 bg-slate-50/60"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center ${bankOpen ? "bg-teal-brand text-white" : "bg-teal-brand/10 text-teal-brand"}`}>
                          <Landmark className="w-4 h-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-bold">Bank Transfer Details</span>
                          <span className={`block text-[11px] ${bankOpen ? "text-teal-brand" : "text-slate-400"}`}>
                            {bankOpen ? "Tap to hide the account details" : "Tap to reveal the account details"}
                          </span>
                        </span>
                      </span>
                      {bankOpen
                        ? <ChevronUp className="w-5 h-5 text-teal-brand shrink-0" />
                        : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 animate-bounce" />}
                    </button>

                    {bankOpen && (
                      <div className={`px-4 py-4 space-y-2 border-t ${isDarkMode ? "border-slate-800 bg-slate-900/40" : "border-slate-100 bg-amber-50/20"}`}>
                        {hasBankAccounts ? (
                          <>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              Transfers for <strong className="text-teal-brand">{currency}</strong> are highlighted first
                            </p>
                            {(() => {
                              // Show the first two accounts across BOTH groups, then
                              // a "Load more" button reveals the remaining ones.
                              const total = matchingAccounts.length + otherAccounts.length;
                              const cap = showAllAccounts ? total : 2;
                              const shownMatching = matchingAccounts.slice(0, cap);
                              const shownOther = otherAccounts.slice(0, Math.max(0, cap - shownMatching.length));
                              return (
                                <>
                                  {shownMatching.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-teal-brand">Recommended for {currency} transfers</p>
                                      {shownMatching.map(renderBankAccount)}
                                    </div>
                                  )}
                                  {shownOther.length > 0 && (
                                    <div className="space-y-2">
                                      {matchingAccounts.length > 0 && (
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Other accounts</p>
                                      )}
                                      {shownOther.map(renderBankAccount)}
                                    </div>
                                  )}
                                  {total > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => setShowAllAccounts(s => !s)}
                                      className={`w-full py-2 rounded-lg border text-[11px] font-black uppercase tracking-wider transition-all hover:opacity-90 ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
                                    >
                                      {showAllAccounts ? "Show fewer accounts" : `Load ${total - 2} more account${total - 2 === 1 ? "" : "s"}`}
                                    </button>
                                  )}
                                </>
                              );
                            })()}
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">Bank transfer details will appear here once the publisher sets them up.</p>
                        )}
                      </div>
                    )}
                  </div>

                </>
              )}

              {/* ── 4. Donor details (validated) — Pay Online only. On the
                    Bank Transfer tab there is nothing to submit, so the donor
                    form and anonymous option are intentionally hidden. ── */}
              {method === "online" && (
              <div className={`rounded-xl border p-4 space-y-3 ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50/60"}`}>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.anonymous}
                    onChange={e => { setForm(f => ({ ...f, anonymous: e.target.checked })); setErrors({}); }}
                    className="w-4 h-4 rounded accent-teal-brand"
                  />
                  <span className="text-xs font-bold">Donate anonymously</span>
                  <Gift className="w-3.5 h-3.5 text-slate-400" />
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {form.anonymous
                    ? "You're giving anonymously — your name and details won't be recorded or shared."
                    : "Unchecking \"Donate anonymously\" means the fields below are required."}
                </p>

                {form.anonymous ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                    <User className="w-4 h-4" /> Donating as <strong className="text-teal-brand">"A Friend of the Ministry"</strong>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Full Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. John Doe"
                        value={form.name}
                        onChange={e => { setForm(f => ({ ...f, name: e.target.value })); if (errors.name) setErrors(er => ({ ...er, name: undefined })); }}
                        className={inputBase}
                      />
                      {errors.name && <p className="text-[11px] text-rose-500 mt-1 font-bold">{errors.name}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Email Address *</label>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          value={form.email}
                          onChange={e => { setForm(f => ({ ...f, email: e.target.value })); if (errors.email && !errors.email.includes("Online payment")) setErrors(er => ({ ...er, email: undefined })); }}
                          className={inputBase}
                        />
                        {errors.email && !errors.email.includes("Online payment") && <p className="text-[11px] text-rose-500 mt-1 font-bold">{errors.email}</p>}
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Phone Number *</label>
                        <input
                          type="tel"
                          placeholder="+234 800 000 0000"
                          value={form.phone}
                          onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); if (errors.phone) setErrors(er => ({ ...er, phone: undefined })); }}
                          className={inputBase}
                        />
                        {errors.phone && <p className="text-[11px] text-rose-500 mt-1 font-bold">{errors.phone}</p>}
                      </div>
                    </div>
                  </div>
                )}

                {(errors.email && errors.email.includes("Online payment")) && (
                  <p className="text-[11px] text-amber-500 mt-1 font-bold">{errors.email}</p>
                )}
              </div>
              )}
            </div>

            {/* Action bar (sticky bottom) — Pay Online only, since Bank
                Transfer has nothing to submit. */}
            {method === "online" && !loading && (
              <div className={`px-6 py-4 border-t shrink-0 ${isDarkMode ? "border-slate-800 bg-slate-950/60" : "border-slate-100 bg-slate-50"}`}>
                {(errors.email && errors.email.includes("Online payment")) && (
                  <p className="text-[11px] text-amber-500 mb-2 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> {errors.email}
                  </p>
                )}
                <button
                  onClick={submitDonation}
                  disabled={!activeAmount || Number(activeAmount) <= 0 || loading || (method === "online" && gateway === "none")}
                  className="w-full py-3.5 bg-gradient-to-r from-teal-brand to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2"
                >
                  <Heart className="w-4.5 h-4.5 fill-current" />
                  {loading
                    ? "Processing..."
                    : `Donate ${CURRENCY_SYMBOL[currency]}${Number(activeAmount || 0).toLocaleString()}`}
                </button>
                <p className="text-center text-[10px] text-slate-400 mt-2 flex items-center justify-center gap-1">
                  <Lock className="w-3 h-3" /> Your details are sanitized and stored securely.
                </p>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
