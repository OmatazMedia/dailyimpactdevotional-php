import React, { useState, useEffect, useCallback } from "react";
import { Shield, Clock, MapPin, Monitor, CheckCircle, XCircle, RefreshCw, Download, ChevronLeft, ChevronRight, Info, Mail, Send, AlertCircle, Inbox } from "lucide-react";
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

interface MailQueueEntry {
  id: string;
  to: string;
  subject: string;
  hasHtml: boolean;
  body: string;
  sent: boolean;
  sentAt: string | null;
  method: string | null; // resend | smtp | mock | null
  attempts: number;
  lastAttemptAt: string | null;
  error: string | null;
  createdAt: string;
}

export default function EmailAuditPanel({ isDarkMode, showToast }: EmailAuditPanelProps) {
  const [loginLog, setLoginLog] = useState<LoginEntry[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  // ── Mail Delivery Status (which transport delivered each queued email) ──
  const [queue, setQueue] = useState<MailQueueEntry[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);

  const loadQueue = useCallback(() => {
    setLoadingQueue(true);
    fetch(`${API_BASE}/mail-queue.php`)
      .then(r => (r.ok ? r.json() : []))
      .then((data: MailQueueEntry[] | null) => setQueue(Array.isArray(data) ? data : []))
      .catch(() => setQueue([]))
      .finally(() => setLoadingQueue(false));
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // Flush any pending emails right now using the configured primary/secondary.
  const sendPendingNow = async () => {
    if (sendingNow) return;
    setSendingNow(true);
    try {
      const res = await fetch(`${API_BASE}/mail-queue.php?action=send`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { success?: boolean; sent?: number; failed?: number; message?: string };
      if (data.success) {
        showToast(
          `Sent ${data.sent ?? 0} email(s)${data.failed ? `, ${data.failed} failed` : ""}.`,
          data.failed ? "info" : "success",
        );
      } else {
        showToast(data.message || "Could not process the queue.", "error");
      }
    } catch {
      showToast("API server not running. Start with: npm run server", "error");
    } finally {
      setSendingNow(false);
      loadQueue();
    }
  };

  // Derived counts for the summary chips (list is capped at the last 100 rows).
  const deliveredCount = queue.filter(q => q.sent && !q.error).length;
  const pendingCount = queue.filter(q => !q.sent && !q.error).length;
  const failedCount = queue.filter(q => !q.sent && q.error).length;

  const methodLabel = (m: string | null) =>
    m === "resend" ? "Resend" : m === "smtp" ? "SMTP" : m === "mock" ? "Mock" : "—";

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

      {/* ── Mail Delivery Status ── */}
      <div className={cardBase}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Mail className="w-4 h-4 text-teal-brand" />
            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mail Delivery Status
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadQueue}
              disabled={loadingQueue}
              className={`flex items-center gap-1.5 py-1 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                isDarkMode ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-500" : "border-slate-200 text-slate-500 hover:text-slate-900"
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${loadingQueue ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <button
              type="button"
              onClick={sendPendingNow}
              disabled={sendingNow || pendingCount === 0}
              className={`flex items-center gap-1.5 py-1 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider border border-teal-brand/30 bg-teal-brand/5 text-teal-brand transition-all hover:bg-teal-brand hover:text-white disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {sendingNow ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send pending now
            </button>
          </div>
        </div>

        {/* Summary chips (list is capped at the most recent 100 rows) */}
        <div className="grid grid-cols-3 gap-2">
          <div className="px-3 py-2.5 rounded-xl border text-center bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400">
            <div className="text-lg font-black leading-none">{pendingCount}</div>
            <div className="text-[9px] uppercase font-black tracking-wider mt-1 opacity-80">Pending</div>
          </div>
          <div className="px-3 py-2.5 rounded-xl border text-center bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400">
            <div className="text-lg font-black leading-none">{deliveredCount}</div>
            <div className="text-[9px] uppercase font-black tracking-wider mt-1 opacity-80">Delivered</div>
          </div>
          <div className="px-3 py-2.5 rounded-xl border text-center bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400">
            <div className="text-lg font-black leading-none">{failedCount}</div>
            <div className="text-[9px] uppercase font-black tracking-wider mt-1 opacity-80">Failed</div>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-500 font-semibold">
          Every queued email follows the configured sequence — <strong className="text-teal-brand">Primary</strong> transport
          first, <strong className="text-amber-500">Secondary</strong> as fallback. The badge shows exactly which transport
          (Resend or SMTP) delivered each message; failures keep their last error until they succeed.
        </p>

        {queue.length === 0 ? (
          <div className="py-8 text-center">
            <Inbox className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-400 italic">
              {loadingQueue ? "Loading..." : "No emails have been queued yet."}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              Notifications, receipts and OTPs appear here as the app sends them.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[440px] overflow-y-auto pr-1">
            {queue.map(entry => {
              const delivered = entry.sent && !entry.error;
              const failed = !entry.sent && !!entry.error;
              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-xl border flex flex-col gap-2.5 ${
                    delivered
                      ? isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50"
                      : failed
                        ? isDarkMode ? "border-rose-900/40 bg-rose-950/20" : "border-rose-100 bg-rose-50/50"
                        : isDarkMode ? "border-amber-900/40 bg-amber-950/15" : "border-amber-100 bg-amber-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs font-black text-slate-800 dark:text-white truncate max-w-[220px]">
                      {entry.subject || "(no subject)"}
                    </span>
                    {delivered && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        Delivered
                      </span>
                    )}
                    {failed && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                        Failed
                      </span>
                    )}
                    {!delivered && !failed && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        Pending
                      </span>
                    )}
                    {entry.method && delivered && (
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        entry.method === "resend"
                          ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                          : entry.method === "smtp"
                            ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                            : "bg-slate-500/10 text-slate-500 dark:text-slate-400"
                      }`}>
                        via {methodLabel(entry.method)}
                      </span>
                    )}
                    {entry.attempts > 0 && (
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                        {entry.attempts} delivery attempt{entry.attempts === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{entry.to}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                      <Clock className="w-3 h-3 shrink-0" />
                      {delivered ? `Delivered ${formatDate(entry.sentAt || "")}` : `Queued ${formatDate(entry.createdAt)}`}
                    </div>
                    {entry.lastAttemptAt && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold sm:col-span-2">
                        <RefreshCw className="w-3 h-3 shrink-0" />
                        Last try {formatDate(entry.lastAttemptAt)}
                      </div>
                    )}
                  </div>

                  {entry.error && (
                    <div className="flex items-start gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-semibold">
                      <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                      <span className="break-words">{entry.error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
