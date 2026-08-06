import React, { useState, useEffect, useCallback } from "react";
import { Shield, Clock, MapPin, Monitor, CheckCircle, XCircle, RefreshCw, Download, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { API_BASE } from "../config/api";

const AUDIT_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

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

export default function EmailAuditPanel({ isDarkMode, showToast }: EmailAuditPanelProps) {
  const [loginLog, setLoginLog] = useState<LoginEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const cardBase = `rounded-2xl border p-6 space-y-4 ${
    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  }`;

  const loadLog = useCallback(() => {
    setLoadingLog(true);
    const q = new URLSearchParams({ page: String(page), perPage: "25" });
    if (month) q.set("month", month);
    if (year) q.set("year", year);
    fetch(`${API_BASE}/login-log.php?${q.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { items?: LoginEntry[]; total?: number; pages?: number } | null) => {
        if (data) {
          setLoginLog(Array.isArray(data.items) ? data.items : []);
          setPages(data.pages || 1);
          setTotal(data.total || 0);
        }
      })
      .catch(() => showToast("API server not running. Start with: npm run server", "error"))
      .finally(() => setLoadingLog(false));
  }, [page, month, year, showToast]);

  useEffect(() => { loadLog(); }, [loadLog]);

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

      {/* ── Login Audit Log ── */}
      <div className={cardBase}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-teal-brand" />
            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Admin Login Audit Log
            </h3>
          </div>
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

        {/* Pointer to the sibling Email Configuration card */}
        <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-[10px] leading-relaxed ${
          isDarkMode ? "bg-slate-950/50 border border-slate-800 text-slate-400" : "bg-slate-50 border border-slate-100 text-slate-500"
        }`}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-brand" />
          <span>
            Email delivery (Resend/SMTP, primary &amp; secondary sequence, test send) and notification
            recipients are configured in the <strong>Email Configuration</strong> card on the left.
          </span>
        </div>

        {/* Month / year filter + CSV export */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Month</label>
            <select
              value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}
              className={`py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
            >
              <option value="">All months</option>
              {AUDIT_MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Year</label>
            <select
              value={year}
              onChange={e => { setYear(e.target.value); setPage(1); }}
              className={`py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`}
            >
              <option value="">All years</option>
              {Array.from(new Set([new Date().getFullYear(), new Date().getFullYear() - 1])).sort((a, b) => b - a).map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => { setPage(1); loadLog(); }}
            className={`inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}
          >
            <RefreshCw className="w-3 h-3" /> Filter
          </button>
          <button
            type="button"
            onClick={() => {
              const q = new URLSearchParams({ format: "csv", perPage: "200" });
              if (month) q.set("month", month);
              if (year) q.set("year", year);
              window.location.href = `${API_BASE}/login-log.php?${q.toString()}`;
            }}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border border-teal-brand/30 bg-teal-brand/5 text-teal-brand text-[10px] font-black uppercase tracking-wider hover:bg-teal-brand hover:text-white transition-all"
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
          <span className="text-[10px] font-bold text-slate-400">{total} event{total === 1 ? "" : "s"}</span>
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

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Page {page} of {pages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage(page + 1)}
                className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
