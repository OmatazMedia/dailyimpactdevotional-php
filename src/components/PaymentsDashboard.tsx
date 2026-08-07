import React, { useState, useEffect, useMemo } from "react";
import {
  Download, FileText, RefreshCw, DollarSign, CheckCircle, Clock,
  Search, TrendingUp, Users, CreditCard, Filter, X
} from "lucide-react";
import { API_BASE } from "../config/api";

interface PaymentsDashboardProps {
  isDarkMode: boolean;
  onShowToast: (msg: string, type?: "success" | "error" | "info") => void;
}

interface DonationRecord {
  id: string;
  amount: number;
  currency: string;
  email: string;
  name: string;
  provider: string;
  status: "success" | "pending" | "failed";
  date: string;
  reference: string;
}

const STATUSES = ["ALL", "success", "pending", "failed"] as const;
const PROVIDERS = ["ALL", "paystack", "flutterwave", "bank", "manual"] as const;

const CURRENCY_SYMBOL: Record<string, string> = {
  NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵", KES: "KSh",
};

const currencySymbol = (c: string) => CURRENCY_SYMBOL[c] || c + " ";

export default function PaymentsDashboard({ isDarkMode, onShowToast }: PaymentsDashboardProps) {
  const [donations, setDonations] = useState<DonationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filters
  const [currencyFilter, setCurrencyFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [providerFilter, setProviderFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  // Prominent display switch: show everything, only Naira, or only Dollar.
  // Every view (stats, chart, table) and both exports respect this switch.
  const [displayCurrency, setDisplayCurrency] = useState<"ALL" | "NGN" | "USD">("ALL");

  // Logo shown in the branded PDF header — honours the admin's custom logo
  // from Settings → Email branding, falling back to the packaged logo. Relative
  // paths are resolved against the current origin so the export window (same
  // domain) can render them.
  const [pdfLogoUrl, setPdfLogoUrl] = useState<string>("/assets/images/dailyimpact.png");
  useEffect(() => {
    fetch(`${API_BASE}/email-config.php?action=templates`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { branding?: { siteLogoUrl?: string } } | null) => {
        const logo = (d?.branding?.siteLogoUrl || "").trim();
        if (!logo) return;
        setPdfLogoUrl(
          logo.startsWith("http") || logo.startsWith("data:")
            ? logo
            : `${window.location.origin}${logo.startsWith("/") ? "" : "/"}${logo}`
        );
      })
      .catch(() => { /* keep default logo */ });
  }, []);

  const loadDonations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/donations.php`);
      const data = await res.json() as DonationRecord[] | null;
      setDonations(Array.isArray(data) ? data : []);
    } catch {
      setDonations([]);
      onShowToast("Could not load donations — check server connection.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDonations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived data ───────────────────────────────────────────────────────────
  const availableCurrencies = useMemo(() => {
    const set = new Set(donations.map(d => d.currency));
    return ["ALL", ...[...set].sort()];
  }, [donations]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return donations.filter(d => {
      if (displayCurrency !== "ALL" && d.currency !== displayCurrency) return false;
      if (currencyFilter !== "ALL" && d.currency !== currencyFilter) return false;
      if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
      if (providerFilter !== "ALL" && d.provider !== providerFilter) return false;
      if (q && !`${d.name} ${d.email} ${d.reference}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [donations, displayCurrency, currencyFilter, statusFilter, providerFilter, searchTerm]);

  const successful = filtered.filter(d => d.status === "success");
  const totalsByCurrency = useMemo(() => {
    const map: Record<string, number> = {};
    for (const d of successful) map[d.currency] = (map[d.currency] || 0) + d.amount;
    return map;
  }, [successful]);
  const totalGifts = successful.length;
  const pendingCount = filtered.filter(d => d.status === "pending").length;
  const failedCount = filtered.filter(d => d.status === "failed").length;

  // Monthly chart data (last 6 months, based on date string)
  const monthlyData = useMemo(() => {
    const months: { key: string; label: string; total: number; count: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleString("en-US", { month: "short" }),
        total: 0,
        count: 0,
      });
    }
    for (const d of successful) {
      const dateObj = new Date(d.date);
      const key = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}`;
      const bucket = months.find(m => m.key === key);
      if (bucket) { bucket.total += d.amount; bucket.count += 1; }
    }
    return months;
  }, [successful]);
  const chartMax = Math.max(...monthlyData.map(m => m.total), 1);

  // ── Branded CSV export ─────────────────────────────────────────────────────
  const exportCSV = () => {
    if (filtered.length === 0) {
      onShowToast("No donations match the current filters to export.", "error");
      return;
    }
    const brand = [
      "Daily Impact Devotional — Donations Report",
      `Generated: ${new Date().toLocaleString()}`,
      `Filters: Currency=${currencyFilter} · Status=${statusFilter} · Provider=${providerFilter}`,
      "",
    ];
    const header = ["Date", "Name", "Email", "Currency", "Amount", "Provider", "Status", "Reference"];
    const rows = filtered.map(d => [
      d.date, d.name || "", d.email || "", d.currency,
      d.amount.toFixed(2), d.provider, d.status, d.reference || "",
    ]);
    const csv = [...brand, header.join(","), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `daily-impact-donations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onShowToast("Donations exported to CSV!", "success");
  };

  // ── Branded PDF export (print-friendly report) ────────────────────────────
  const exportPDF = () => {
    if (filtered.length === 0) {
      onShowToast("No donations match the current filters to export.", "error");
      return;
    }
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      onShowToast("Popup blocked — allow popups to export the PDF report.", "error");
      return;
    }
    const rowsHtml = filtered.map(d => `
      <tr>
        <td>${d.date}</td>
        <td>${(d.name || "").replace(/</g, "&lt;")}</td>
        <td>${(d.email || "").replace(/</g, "&lt;")}</td>
        <td class="num">${currencySymbol(d.currency)}${d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        <td>${d.provider}</td>
        <td><span class="st ${d.status}">${d.status}</span></td>
        <td>${(d.reference || "").replace(/</g, "&lt;")}</td>
      </tr>`).join("");
    const totalSummary = Object.entries(totalsByCurrency)
      .map(([c, v]) => `<span class="total-pill">${currencySymbol(c)}${v.toLocaleString()}</span>`)
      .join(" ");
    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Daily Impact Devotional — Donations Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #0f172a; margin: 32px; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom: 3px solid #0d9488; padding-bottom: 12px; margin-bottom: 18px; }
  .brand h1 { font-size: 18px; margin: 0; letter-spacing: 0.5px; }
  .brand p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
  .filters { font-size: 11px; color: #475569; margin-bottom: 14px; }
  .total-pill { display:inline-block; background:#f0fdfa; border:1px solid #99f6e4; color:#0f766e; padding:4px 10px; border-radius:999px; margin-right:6px; font-size:12px; font-weight:bold; }
  table { width:100%; border-collapse: collapse; font-size: 11px; margin-top: 14px; }
  th { background: #0d9488; color:#fff; text-align:left; padding:8px 10px; text-transform: uppercase; letter-spacing:0.5px; font-size:10px; }
  td { padding:7px 10px; border-bottom:1px solid #e2e8f0; }
  tr:nth-child(even) td { background:#f8fafc; }
  .num { text-align:right; font-variant-numeric: tabular-nums; }
  .st { text-transform: uppercase; font-size: 9px; font-weight: bold; padding:2px 6px; border-radius:4px; }
  .st.success { background:#dcfce7; color:#15803d; }
  .st.pending { background:#fef9c3; color:#a16207; }
  .st.failed { background:#fee2e2; color:#b91c1c; }
  .foot { margin-top: 24px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 10px; }
</style></head><body>
  <div class="brand">
    <div style="display:flex;align-items:center;gap:12px;">
      <img src="${pdfLogoUrl}" alt="Daily Impact Devotional" style="height:44px;width:auto;" onerror="this.style.display='none'" />
      <div><h1>Daily Impact Devotional</h1><p>Donations Report — generated ${new Date().toLocaleString()}</p></div>
    </div>
    <div>${totalSummary}</div>
  </div>
  <div class="filters">Currency: <b>${currencyFilter}</b> · Status: <b>${statusFilter}</b> · Provider: <b>${providerFilter}</b> · ${filtered.length} record(s)</div>
  <table>
    <thead><tr><th>Date</th><th>Name</th><th>Email</th><th>Amount</th><th>Provider</th><th>Status</th><th>Reference</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="foot">Daily Impact Devotional Ministries — Thank you for your support. This report was exported from the admin dashboard.</div>
</body></html>`);
    win.document.close();
    win.focus();
    win.print();
    onShowToast("Donations PDF report opened — use Save as PDF.", "success");
  };

  const cardBase = `rounded-2xl border p-5 space-y-4 ${
    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  }`;
  const selectBase = `py-2 px-3 border rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
  }`;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-teal-brand" />
            Donations
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
            All donations received through the website. Gateway configuration lives in Settings → Payments &amp; Donations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadDonations}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button
            onClick={exportPDF}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Currency display switch — the chosen currency drives everything below */}
      <div className={`${cardBase} !py-3.5 flex flex-wrap items-center justify-between gap-3`}>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5" />
          View donations in
        </span>
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
          {(["ALL", "NGN", "USD"] as const).map(c => (
            <button
              key={c}
              onClick={() => setDisplayCurrency(c)}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                displayCurrency === c
                  ? c === "NGN"
                    ? "bg-emerald-500 text-white shadow-sm"
                    : c === "USD"
                      ? "bg-sky-500 text-white shadow-sm"
                      : "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {c === "ALL" ? "All" : c === "NGN" ? "₦ Naira" : "$ Dollar"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <span className="text-emerald-500"><DollarSign className="w-5 h-5" /></span>
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white">
              {displayCurrency !== "ALL"
                ? (totalsByCurrency[displayCurrency]
                    ? `${currencySymbol(displayCurrency)}${totalsByCurrency[displayCurrency].toLocaleString()}`
                    : `${currencySymbol(displayCurrency)}0`)
                : (Object.entries(totalsByCurrency).map(([c, v]) => (
                    <span key={c} className="mr-2">{currencySymbol(c)}{v.toLocaleString()}</span>
                  )))}
              {displayCurrency === "ALL" && Object.keys(totalsByCurrency).length === 0 && "—"}
            </p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Received {displayCurrency !== "ALL" ? `(${displayCurrency})` : ""}</p>
          </div>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <span className="text-teal-brand"><CheckCircle className="w-5 h-5" /></span>
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white">{totalGifts}</p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Successful Gifts</p>
          </div>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <span className="text-amber-500"><Clock className="w-5 h-5" /></span>
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white">{pendingCount}</p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Pending</p>
          </div>
        </div>
        <div className={cardBase}>
          <div className="flex items-center justify-between">
            <span className="text-rose-500"><Users className="w-5 h-5" /></span>
          </div>
          <div>
            <p className="text-xl font-black text-slate-900 dark:text-white">{failedCount}</p>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Failed</p>
          </div>
        </div>
      </div>

      {/* Currency tabs */}
      <div className={`${cardBase} space-y-5`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Currency
          </span>
          {availableCurrencies.map(c => (
            <button
              key={c}
              onClick={() => setCurrencyFilter(c)}
              className={`py-1.5 px-3.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                currencyFilter === c
                  ? "bg-teal-brand text-white shadow-sm"
                  : isDarkMode ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {c === "ALL" ? "All" : c}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, reference…"
              className={`w-full py-2 pl-9 pr-8 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
                isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
              }`}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectBase}>
            {STATUSES.map(s => <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</option>)}
          </select>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} className={selectBase}>
            {PROVIDERS.map(p => <option key={p} value={p}>{p === "ALL" ? "All Providers" : p}</option>)}
          </select>
        </div>

        {/* Chart */}
        <div className={`rounded-xl border p-4 ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50"}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-teal-brand" /> Donations — Last 6 Months
            </h3>
            <span className="text-[10px] text-slate-400 font-bold">successful only</span>
          </div>
          <div className="flex items-end gap-3 h-36">
            {monthlyData.map((m, i) => (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                {/* Track has a definite height (flex-1 within h-36), so the bar's
                    percentage height resolves correctly instead of collapsing. */}
                <div className="relative w-full flex flex-1 items-end justify-center overflow-hidden">
                  <div
                    className="w-full max-w-[46px] bg-gradient-to-t from-teal-brand to-emerald-300 dark:to-teal-brand/70 rounded-t-md transition-all duration-500 hover:opacity-80"
                    style={{ height: `${Math.max((m.total / chartMax) * 100, m.total > 0 ? 6 : 2)}%` }}
                    title={`${m.label}: ${currencySymbol(Object.keys(totalsByCurrency)[0] || "NGN")}${m.total.toLocaleString()} (${m.count})`}
                  />
                  {m.total > 0 && (
                    <span className="absolute -top-4 text-[8px] font-mono font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : Math.round(m.total)}
                    </span>
                  )}
                </div>
                <span className={`text-[9px] font-bold uppercase ${i === 5 ? "text-teal-brand" : "text-slate-400"}`}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Donations table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Donation Records <span className="ml-1 text-teal-brand">({filtered.length})</span>
            </h3>
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12 text-center">
              <p className="text-sm font-bold text-slate-400">No donations match the current filters.</p>
              <p className="text-xs text-slate-400/80 mt-1">Try clearing filters or refreshing.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`${isDarkMode ? "bg-slate-950" : "bg-slate-50"} text-[10px] uppercase tracking-widest text-slate-400 font-black`}>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3 text-right">Amount</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{d.date}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200">{d.name || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400">{d.email || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900 dark:text-white whitespace-nowrap">
                        {currencySymbol(d.currency)}{d.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 capitalize">{d.provider}</td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide ${
                          d.status === "success" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : d.status === "pending" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        }`}>{d.status}</span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400 truncate max-w-[140px]">{d.reference || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
