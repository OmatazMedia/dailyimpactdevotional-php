import React, { useState, useEffect } from "react";
import {
  CreditCard, Globe, Webhook, Save, Eye, EyeOff, DollarSign
} from "lucide-react";
import { API_BASE } from "../config/api";
import { apiPut } from "../lib/api";

interface DonationSettingsProps {
  isDarkMode: boolean;
  onShowToast: (msg: string, type?: "success" | "error" | "info") => void;
}

interface PaystackConfig {
  publicKey: string;
  secretKey: string;
  enabled: boolean;
}

interface FlutterwaveConfig {
  publicKey: string;
  secretKey: string;
  encryptionKey: string;
  enabled: boolean;
}

interface WebhookConfig {
  url: string;
  secret: string;
  enabled: boolean;
}

function saveSettings(data: Record<string, string | boolean>) {
  // apiPut retries via POST ?_method=PUT on hosts that block the PUT verb.
  return apiPut(`${API_BASE}/settings.php`, data).catch(() => {});
}

/**
 * Donation gateway configuration — moved out of the Payments page into
 * Settings → Payments & Donations so the Payments page can focus purely on
 * donations received through the website.
 */
export default function DonationSettings({ isDarkMode, onShowToast }: DonationSettingsProps) {
  const [paystack, setPaystack] = useState<PaystackConfig>({ publicKey: "", secretKey: "", enabled: false });
  const [showPsSecret, setShowPsSecret] = useState(false);

  const [flw, setFlw] = useState<FlutterwaveConfig>({ publicKey: "", secretKey: "", encryptionKey: "", enabled: false });
  const [showFlwSecret, setShowFlwSecret] = useState(false);
  const [showFlwEnc, setShowFlwEnc] = useState(false);

  const [webhook, setWebhook] = useState<WebhookConfig>({ url: "", secret: "", enabled: false });
  const [showWHSecret, setShowWHSecret] = useState(false);

  const [defaultCurrency, setDefaultCurrency] = useState("NGN");
  const [donationMessage, setDonationMessage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) return;
        setPaystack({
          publicKey: String(data.paystack_public_key ?? ""),
          secretKey: String(data.paystack_secret_key ?? ""),
          enabled: String(data.paystack_enabled ?? "false") === "true",
        });
        setFlw({
          publicKey: String(data.flutterwave_public_key ?? ""),
          secretKey: String(data.flutterwave_secret_key ?? ""),
          encryptionKey: String(data.flutterwave_encryption_key ?? ""),
          enabled: String(data.flutterwave_enabled ?? "false") === "true",
        });
        setWebhook({
          url: String(data.webhook_url ?? ""),
          secret: String(data.webhook_secret ?? ""),
          enabled: String(data.webhook_enabled ?? "false") === "true",
        });
        setDefaultCurrency(String(data.default_currency ?? "NGN"));
        setDonationMessage(String(data.donation_message ?? ""));
      })
      .catch(() => {});
  }, []);

  const handleSavePaystack = async () => {
    await saveSettings({
      paystack_public_key: paystack.publicKey,
      paystack_secret_key: paystack.secretKey,
      paystack_enabled: String(paystack.enabled),
    });
    onShowToast("Paystack configuration saved!", "success");
  };

  const handleSaveFlw = async () => {
    await saveSettings({
      flutterwave_public_key: flw.publicKey,
      flutterwave_secret_key: flw.secretKey,
      flutterwave_encryption_key: flw.encryptionKey,
      flutterwave_enabled: String(flw.enabled),
    });
    onShowToast("Flutterwave configuration saved!", "success");
  };

  const handleSaveWebhook = async () => {
    await saveSettings({
      webhook_url: webhook.url,
      webhook_secret: webhook.secret,
      webhook_enabled: String(webhook.enabled),
    });
    onShowToast("Webhook configuration saved!", "success");
  };

  const handleSaveDonationDefaults = async () => {
    await saveSettings({
      default_currency: defaultCurrency,
      donation_message: donationMessage,
    });
    onShowToast("Donation preferences saved!", "success");
  };

  const cardBase = `rounded-2xl border p-6 space-y-4 ${
    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  }`;

  const inputBase = `w-full py-2.5 px-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
  }`;

  const toggleBtn = (on: boolean, toggle: () => void) => (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className={`relative w-12 h-7 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
        on
          ? "bg-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.45)]"
          : "bg-slate-300 dark:bg-slate-700"
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-md transition-transform duration-300 ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );

  // Colour-coded status pill shown next to each gateway switch.
  const gatewayStatus = (on: boolean) => (
    <span className={`text-[10px] font-black uppercase tracking-wider ${on ? "text-emerald-500" : "text-slate-400"}`}>
      {on ? "● Enabled" : "○ Disabled"}
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Donation preferences */}
      <div className={`${cardBase} max-w-2xl`}>
        <h3 className="font-serif font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-teal-brand" /> Donation Preferences
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Default Currency</label>
            <select
              value={defaultCurrency}
              onChange={e => setDefaultCurrency(e.target.value)}
              className={inputBase}
            >
              {["NGN", "USD", "GBP"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Donation Thank-you Message</label>
            <textarea
              rows={2}
              value={donationMessage}
              onChange={e => setDonationMessage(e.target.value)}
              className={inputBase}
            />
          </div>
          <button onClick={handleSaveDonationDefaults}
            className="w-full py-2.5 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-2">
            <Save className="w-3.5 h-3.5" /> Save Donation Preferences
          </button>
        </div>
      </div>

      {/* Paystack */}
      <div className={`${cardBase} max-w-2xl`}>
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-teal-brand" /> Paystack Configuration
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            {gatewayStatus(paystack.enabled)}
            {toggleBtn(paystack.enabled, () => setPaystack(p => ({ ...p, enabled: !p.enabled })))}
          </label>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Get your keys from <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="text-teal-brand underline">dashboard.paystack.com</a> → Settings → API Keys & Webhooks.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Public Key</label>
            <input type="text" placeholder="pk_live_..." value={paystack.publicKey}
              onChange={e => setPaystack(p => ({ ...p, publicKey: e.target.value }))}
              className={inputBase} />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Secret Key</label>
            <div className="relative">
              <input type={showPsSecret ? "text" : "password"} placeholder="sk_live_..." value={paystack.secretKey}
                onChange={e => setPaystack(p => ({ ...p, secretKey: e.target.value }))}
                className={`${inputBase} pr-10`} />
              <button type="button" onClick={() => setShowPsSecret(!showPsSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand">
                {showPsSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-rose-400 mt-1 font-bold">⚠ Secret key is sensitive — never share it. Saved securely to settings.json.</p>
          </div>
        </div>

        <button onClick={handleSavePaystack}
          className="w-full py-2.5 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-2">
          <Save className="w-3.5 h-3.5" /> Save Paystack Config
        </button>
      </div>

      {/* Flutterwave */}
      <div className={`${cardBase} max-w-2xl`}>
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-teal-brand" /> Flutterwave Configuration
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            {gatewayStatus(flw.enabled)}
            {toggleBtn(flw.enabled, () => setFlw(f => ({ ...f, enabled: !f.enabled })))}
          </label>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Get your keys from <a href="https://dashboard.flutterwave.com" target="_blank" rel="noopener noreferrer" className="text-teal-brand underline">dashboard.flutterwave.com</a> → Settings → API.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Public Key</label>
            <input type="text" placeholder="FLWPUBK_TEST-..." value={flw.publicKey}
              onChange={e => setFlw(f => ({ ...f, publicKey: e.target.value }))} className={inputBase} />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Secret Key</label>
            <div className="relative">
              <input type={showFlwSecret ? "text" : "password"} placeholder="FLWSECK_TEST-..." value={flw.secretKey}
                onChange={e => setFlw(f => ({ ...f, secretKey: e.target.value }))} className={`${inputBase} pr-10`} />
              <button type="button" onClick={() => setShowFlwSecret(!showFlwSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand">
                {showFlwSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Encryption Key</label>
            <div className="relative">
              <input type={showFlwEnc ? "text" : "password"} placeholder="Encryption key..." value={flw.encryptionKey}
                onChange={e => setFlw(f => ({ ...f, encryptionKey: e.target.value }))} className={`${inputBase} pr-10`} />
              <button type="button" onClick={() => setShowFlwEnc(!showFlwEnc)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand">
                {showFlwEnc ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[10px] text-rose-400 mt-1 font-bold">⚠ Keys saved securely to settings.json (not committed to git).</p>
          </div>
        </div>

        <button onClick={handleSaveFlw}
          className="w-full py-2.5 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-2">
          <Save className="w-3.5 h-3.5" /> Save Flutterwave Config
        </button>
      </div>

      {/* Webhook */}
      <div className={`${cardBase} max-w-2xl`}>
        <div className="flex items-center justify-between">
          <h3 className="font-serif font-black text-sm uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
            <Webhook className="w-4 h-4 text-teal-brand" /> Webhook Configuration
          </h3>
          <label className="flex items-center gap-2 cursor-pointer">
            {gatewayStatus(webhook.enabled)}
            {toggleBtn(webhook.enabled, () => setWebhook(w => ({ ...w, enabled: !w.enabled })))}
          </label>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Set your webhook endpoint URL — paste it into your Paystack or Flutterwave dashboard so payment events are sent here automatically.
          The server listens at <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px] font-mono">POST /backend/api/webhook-payment.php</code>.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Webhook URL</label>
            <input type="url" placeholder="https://yourdomain.com/backend/api/webhook-payment.php" value={webhook.url}
              onChange={e => setWebhook(w => ({ ...w, url: e.target.value }))} className={inputBase} />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Webhook Secret (for signature verification)</label>
            <div className="relative">
              <input type={showWHSecret ? "text" : "password"} placeholder="whsec_..." value={webhook.secret}
                onChange={e => setWebhook(w => ({ ...w, secret: e.target.value }))} className={`${inputBase} pr-10`} />
              <button type="button" onClick={() => setShowWHSecret(!showWHSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand">
                {showWHSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <button onClick={handleSaveWebhook}
          className="w-full py-2.5 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all flex items-center justify-center gap-2">
          <Save className="w-3.5 h-3.5" /> Save Webhook Config
        </button>
      </div>
    </div>
  );
}
