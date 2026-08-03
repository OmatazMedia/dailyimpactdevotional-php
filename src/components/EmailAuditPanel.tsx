import React, { useState, useEffect } from "react";
import { Mail, Save, Eye, EyeOff, Shield, Clock, MapPin, Monitor, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { API_BASE } from "../config/api";
import { apiPut } from "../lib/api";

interface EmailAuditPanelProps {
  isDarkMode: boolean;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

interface LoginEntry {
  id: string;
  email: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  success: boolean;
  location?: string;
}

interface SmtpSettings {
  notify_email: string;
  smtp_host: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_port: string;
}

function getSmtpSettings(): SmtpSettings {
  return { notify_email: "", smtp_host: "", smtp_user: "", smtp_pass: "", smtp_port: "587" };
}

export default function EmailAuditPanel({ isDarkMode, showToast }: EmailAuditPanelProps) {
  const [smtp, setSmtp] = useState<SmtpSettings>(getSmtpSettings);
  const [showPass, setShowPass] = useState(false);
  const [loginLog, setLoginLog] = useState<LoginEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);

  const cardBase = `rounded-2xl border p-6 space-y-4 ${
    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  }`;

  const inputBase = `w-full py-2.5 px-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
  }`;

  const loadLog = () => {
    setLoadingLog(true);
    fetch(`${API_BASE}/login-log.php`)
      .then(r => r.ok ? r.json() : [])
      .then((data: LoginEntry[]) => setLoginLog([...data].reverse()))
      .catch(() => showToast("API server not running. Start with: npm run server", "error"))
      .finally(() => setLoadingLog(false));
  };

  useEffect(() => { loadLog(); }, []);

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, unknown> | null) => {
        if (!data) return;
        setSmtp({
          notify_email: String(data.notify_email ?? ""),
          smtp_host: String(data.smtp_host ?? ""),
          smtp_user: String(data.smtp_user ?? ""),
          smtp_pass: String(data.smtp_pass ?? ""),
          smtp_port: String(data.smtp_port ?? "587"),
        });
      })
      .catch(() => {});
  }, []);

  const handleSaveSmtp = async () => {
    try {
      await apiPut(`${API_BASE}/settings.php`, smtp);
      showToast("Email & SMTP settings saved!", "success");
    } catch {
      showToast("Unable to save email settings.", "error");
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-NG", {
        timeZone: "Africa/Lagos",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " WAT";
    } catch { return iso; }
  };

  const parseDevice = (ua: string) => {
    if (!ua || ua === "Unknown") return "Unknown device";
    const browser = ua.match(/(Chrome|Firefox|Safari|Edg|Opera)[\/ ]([\d.]+)/)?.[1] ?? "Browser";
    const os = ua.includes("Windows") ? "Windows"
      : ua.includes("Mac") ? "macOS"
      : ua.includes("Android") ? "Android"
      : ua.includes("iPhone") ? "iPhone"
      : ua.includes("Linux") ? "Linux" : "Unknown OS";
    return `${browser} on ${os}`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* ── SMTP / Email Config ── */}
      <div className={cardBase}>
        <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Mail className="w-4 h-4 text-teal-brand" />
          Email Notification Settings
        </h3>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Configure SMTP to receive real-time email alerts on every admin login — including IP address, device, location and timestamp.
          Use Gmail (App Password), Mailgun, or any SMTP provider.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Notify Email */}
          <div className="md:col-span-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Notify Email Address</label>
            <input
              type="email"
              placeholder="admin@yourministry.org"
              value={smtp.notify_email}
              onChange={e => setSmtp(s => ({ ...s, notify_email: e.target.value }))}
              className={inputBase}
            />
            <p className="text-[9px] text-slate-400 mt-1">Login alerts and donation notifications will be sent here.</p>
          </div>

          {/* SMTP Host */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">SMTP Host</label>
            <input
              type="text"
              placeholder="smtp.gmail.com"
              value={smtp.smtp_host}
              onChange={e => setSmtp(s => ({ ...s, smtp_host: e.target.value }))}
              className={inputBase}
            />
          </div>

          {/* SMTP Port */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">SMTP Port</label>
            <input
              type="text"
              placeholder="587"
              value={smtp.smtp_port}
              onChange={e => setSmtp(s => ({ ...s, smtp_port: e.target.value }))}
              className={inputBase}
            />
            <p className="text-[9px] text-slate-400 mt-1">587 (TLS) or 465 (SSL)</p>
          </div>

          {/* SMTP User */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">SMTP Username</label>
            <input
              type="email"
              placeholder="your@gmail.com"
              value={smtp.smtp_user}
              onChange={e => setSmtp(s => ({ ...s, smtp_user: e.target.value }))}
              className={inputBase}
            />
          </div>

          {/* SMTP Password */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">SMTP Password / App Password</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                placeholder="••••••••••••••••"
                value={smtp.smtp_pass}
                onChange={e => setSmtp(s => ({ ...s, smtp_pass: e.target.value }))}
                className={`${inputBase} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[9px] text-rose-400 mt-1 font-bold">
              For Gmail, use an App Password (not your Gmail password). Settings → Security → App passwords.
            </p>
          </div>
        </div>

        <button
          onClick={handleSaveSmtp}
          className="py-2.5 px-5 rounded-xl bg-teal-brand text-white text-[11px] font-black uppercase tracking-wider hover:opacity-90 transition-all flex items-center gap-2"
        >
          <Save className="w-3.5 h-3.5" /> Save Email Settings
        </button>
      </div>

      {/* ── Login Audit Log ── */}
      <div className={cardBase}>
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-teal-brand" />
            Admin Login Audit Log
          </h3>
          <button
            onClick={loadLog}
            disabled={loadingLog}
            className={`flex items-center gap-1.5 py-1 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
              isDarkMode ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500" : "border-slate-200 text-slate-500 hover:text-slate-900"
            }`}
          >
            <RefreshCw className={`w-3 h-3 ${loadingLog ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {loginLog.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm text-slate-400 italic">
              {loadingLog ? "Loading..." : "No login events recorded yet."}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Login events are recorded when admins sign in. Make sure the API server is running.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
            {loginLog.map(entry => (
              <div
                key={entry.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-start gap-3 ${
                  entry.success
                    ? isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50"
                    : isDarkMode ? "border-rose-900/40 bg-rose-950/20" : "border-rose-100 bg-rose-50/50"
                }`}
              >
                {/* Status icon */}
                <div className="shrink-0 mt-0.5">
                  {entry.success
                    ? <CheckCircle className="w-4 h-4 text-emerald-500" />
                    : <XCircle className="w-4 h-4 text-rose-500" />}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="text-xs font-black text-slate-800 dark:text-white">{entry.email}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      entry.success
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                    }`}>
                      {entry.success ? "Successful" : "Failed"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                      <Clock className="w-3 h-3 shrink-0" />
                      {formatDate(entry.timestamp)}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                      <MapPin className="w-3 h-3 shrink-0" />
                      {entry.location || "Unknown location"} · {entry.ip}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold sm:col-span-2">
                      <Monitor className="w-3 h-3 shrink-0" />
                      {parseDevice(entry.userAgent)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
