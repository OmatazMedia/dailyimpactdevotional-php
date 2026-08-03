import React, { useEffect, useState } from "react";
import { X, Heart, ShieldCheck, Copy, Check } from "lucide-react";
import { API_BASE } from "../config/api";
import { motion, AnimatePresence } from "motion/react";

interface DonateModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

type Settings = {
  donation_message?: string;
  default_currency?: string;
  paystack_enabled?: string;
  flutterwave_enabled?: string;
  bank_transfer_enabled?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_name?: string;
};

export default function DonateModal({ isOpen, onClose, isDarkMode }: DonateModalProps) {
  const [currency, setCurrency] = useState<"USD" | "NGN" | "GBP">("NGN");
  const [amount, setAmount] = useState<string>("5000");
  const [customAmount, setCustomAmount] = useState<string>("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Settings | null) => {
        if (data) {
          setSettings(data);
          const cur = (data.default_currency || "NGN") as "USD" | "NGN" | "GBP";
          setCurrency(cur);
        }
      })
      .catch(() => {});
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

  const submitDonation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/donations.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(activeAmount || 0),
          currency,
          email: "",
          name: "",
          provider: settings.paystack_enabled === "true" ? "paystack" : settings.flutterwave_enabled === "true" ? "flutterwave" : "bank",
          status: "pending",
          reference: `DID-${Date.now()}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to save donation");
      const data = await res.json();
      if (settings.bank_transfer_enabled !== "false") {
        alert(`Donation request saved. Reference: ${data.reference}. Please complete payment using the bank details or gateway configured by the admin.`);
      }
      onClose();
    } catch {
      alert("Unable to create donation request right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className={`relative w-full max-w-lg rounded-2xl p-6 md:p-8 custom-shadow overflow-hidden z-10 ${isDarkMode ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800"}`}
          >
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-teal-500 via-amber-400 to-amber-500" />
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Heart className="w-6 h-6 text-red-500 fill-red-500" />
                <h3 className="text-xl font-bold font-serif">Support the Devotional</h3>
              </div>
              <button onClick={onClose} className={`p-2 rounded-full ${isDarkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}><X className="w-5 h-5" /></button>
            </div>
            <p className={`text-sm mb-6 ${isDarkMode ? "text-slate-400" : "text-slate-600"}`}>{settings.donation_message || "Thank you for your generosity."}</p>
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Select Currency</label>
              <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
                {(["USD", "NGN", "GBP"] as const).map(curr => (
                  <button key={curr} onClick={() => { setCurrency(curr); setAmount(presets[curr][2]); setCustomAmount(""); }} className={`flex-1 py-2 text-sm font-semibold rounded-lg ${currency === curr ? "bg-white dark:bg-slate-700 text-teal-brand shadow-sm" : "text-slate-500"}`}>{curr}</button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Select Amount</label>
              <div className="grid grid-cols-5 gap-2">
                {currentPresets.map(preset => (
                  <button key={preset} onClick={() => { setAmount(preset); setCustomAmount(""); }} className={`py-2 px-1 text-center text-sm font-semibold rounded-lg border ${amount === preset && !customAmount ? "border-teal-brand bg-teal-brand/10 text-teal-brand" : isDarkMode ? "border-slate-800 bg-slate-800/50 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{currency === "USD" ? "$" : currency === "GBP" ? "£" : "₦"}{Number(preset).toLocaleString()}</button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-slate-400">Or Enter Custom Amount</label>
              <input type="number" placeholder="Other amount" value={customAmount} onChange={(e) => { setCustomAmount(e.target.value); setAmount(""); }} className={`w-full py-3 px-4 text-sm font-medium rounded-xl border ${isDarkMode ? "bg-slate-800 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-800"}`} />
            </div>
            {settings.bank_transfer_enabled !== "false" && (
              <div className={`p-4 rounded-xl mb-6 border ${isDarkMode ? "bg-slate-800/40 border-slate-700/60" : "bg-amber-50/40 border-amber-200/50"}`}>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-3 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4" /> Secure Bank Transfer Details</h4>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/40 dark:border-slate-700/40"><span className="text-slate-400">Bank Name</span><span className="font-semibold">{settings.bank_name || ""}</span></div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/40 dark:border-slate-700/40"><span className="text-slate-400">Account Number</span><button onClick={() => handleCopy(settings.bank_account_number || "", "acc")} className="font-mono font-bold flex items-center gap-1 hover:text-teal-brand text-slate-700 dark:text-slate-200">{settings.bank_account_number || ""}{copiedText === "acc" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-teal-brand" />}</button></div>
                  <div className="flex justify-between items-center py-1"><span className="text-slate-400">Account Name</span><span className="font-semibold text-right max-w-[200px] truncate">{settings.bank_account_name || ""}</span></div>
                </div>
              </div>
            )}
            <button onClick={submitDonation} disabled={!activeAmount || Number(activeAmount) <= 0 || loading} className="w-full py-3.5 bg-gradient-to-r from-teal-brand to-teal-600 text-white rounded-xl font-bold shadow-lg shadow-teal-500/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2">
              <Heart className="w-4.5 h-4.5 fill-current" />
              {loading ? "Processing..." : `Create Donation Request of ${currency === "USD" ? "$" : currency === "GBP" ? "£" : "₦"}${Number(activeAmount || 0).toLocaleString()}`}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
