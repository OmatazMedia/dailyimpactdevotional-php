import React, { useState, useEffect, useCallback } from "react";
import {
  BarChart3, Users, Clock, Globe, Monitor, FileText, RefreshCw, Download,
  Calendar, TrendingUp, MapPin, Smartphone, Tablet, Eye, MousePointerClick
} from "lucide-react";
import { API_BASE } from "../config/api";

interface AnalyticsDashboardProps {
  isDarkMode: boolean;
  onShowToast: (msg: string, type?: "success" | "error" | "info") => void;
}

interface Summary {
  month: string;
  year: number;
  totalVisits: number;
  uniqueVisitors: number;
  avgDurationSec: number;
  perDay: { day: number; visits: number }[];
  locales: { locale: string; visits: number }[];
  countries: { country: string; visits: number }[];
  devices: { device: string; visits: number }[];
  pages: { page: string; visits: number }[];
  recent: {
    id: string; page: string; referrer: string; locale: string;
    country: string; city: string; device: string; duration: number;
    visitedAt: string; isNew: boolean;
  }[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fmtDuration = (sec: number): string => {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const fmtTime = (iso: string): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-NG", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

const deviceIcon = (d: string) =>
  d === "mobile" ? <Smartphone className="w-3.5 h-3.5" /> :
  d === "tablet" ? <Tablet className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />;

// ─── CSV export helpers ────────────────────────────────────────────────────────
// Escape a cell for CSV: quote it, doubling any embedded quotes, and strip
// newlines so a single cell can never break the row layout.
const csvCell = (v: string | number): string => {
  const s = String(v ?? "").replace(/[\r\n]+/g, " ").replace(/"/g, '""');
  return /[,"\n]/.test(s) ? `"${s}"` : s;
};

const csvRow = (cells: (string | number)[]): string => cells.map(csvCell).join(",");

const fmtCsvTime = (iso: string): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
};

const csvSection = (title: string, rows: string[]): string =>
  [title, ...rows, ""].join("\n");

// Build the full month/year report as a CSV document.
function buildAnalyticsCsv(summary: Summary): string {
  const lines: string[] = [];
  lines.push(`Daily Impact Devotional — Website Analytics Report`);
  lines.push(`Period,${summary.month} ${summary.year}`);
  lines.push(`Total Visits,${summary.totalVisits}`);
  lines.push(`Unique Visitors,${summary.uniqueVisitors}`);
  lines.push(`Average Time on Site,${fmtDuration(summary.avgDurationSec)}`);
  lines.push(`Active Days,${summary.perDay.filter(d => d.visits > 0).length}`);
  lines.push("");

  lines.push(csvSection("Visits per Day", [
    csvRow(["Day", "Visits"]),
    ...summary.perDay.map(d => csvRow([d.day, d.visits])),
  ]));

  lines.push(csvSection("Top Countries", [
    csvRow(["Country", "Visits"]),
    ...summary.countries.map(c => csvRow([c.country, c.visits])),
  ]));

  lines.push(csvSection("Visitor Languages", [
    csvRow(["Language", "Visits"]),
    ...summary.locales.map(l => csvRow([l.locale, l.visits])),
  ]));

  lines.push(csvSection("Devices", [
    csvRow(["Device", "Visits"]),
    ...summary.devices.map(d => csvRow([d.device, d.visits])),
  ]));

  lines.push(csvSection("Top Pages", [
    csvRow(["Page", "Visits"]),
    ...summary.pages.map(p => csvRow([p.page, p.visits])),
  ]));

  lines.push(csvSection("Recent Visits", [
    csvRow(["Time", "Page", "Referrer", "Country", "City", "Locale", "Device", "Duration (s)"]),
    ...summary.recent.map(r => csvRow([
      fmtCsvTime(r.visitedAt), r.page || "/", r.referrer || "",
      r.country || "", r.city || "", r.locale || "", r.device, r.duration,
    ])),
  ]));

  return lines.join("\n");
}

// Trigger a browser download of the given CSV content.
function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AnalyticsDashboard({ isDarkMode, onShowToast }: AnalyticsDashboardProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ranges, setRanges] = useState<{ year: number; month: string }[]>([]);
  const [month, setMonth] = useState<string>(() => {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", month: "long" }).format(new Date()); }
    catch { return "July"; }
  });
  const [year, setYear] = useState<number>(() => {
    try { return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lagos", year: "numeric" }).format(new Date()), 10); }
    catch { return new Date().getFullYear(); }
  });
  const [isLoading, setIsLoading] = useState(false);

  const loadRanges = useCallback(() => {
    fetch(`${API_BASE}/analytics.php?action=ranges`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { success?: boolean; ranges?: { year: number; month: string }[] } | null) => {
        if (data?.success && Array.isArray(data.ranges)) {
          setRanges(data.ranges);
          // Prefer the most recent month that actually has data.
          if (data.ranges.length > 0) {
            setMonth(data.ranges[0].month);
            setYear(data.ranges[0].year);
          }
        }
      })
      .catch(() => {});
  }, []);

  const loadSummary = useCallback((m: string, y: number) => {
    setIsLoading(true);
    fetch(`${API_BASE}/analytics.php?action=summary&month=${encodeURIComponent(m)}&year=${y}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: Summary | null) => {
        if (data && data.month) setSummary(data);
        else onShowToast("No analytics data for that period yet.", "info");
      })
      .catch(() => onShowToast("Could not load analytics — check server connection.", "error"))
      .finally(() => setIsLoading(false));
  }, [onShowToast]);

  useEffect(() => {
    loadRanges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the report whenever the selected month/year changes — including when
  // loadRanges switches the selection to the most recent month with data.
  useEffect(() => {
    loadSummary(month, year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const changePeriod = (m: string, y: number) => {
    setMonth(m);
    setYear(y);
  };

  const chartMax = Math.max(...(summary?.perDay.map(d => d.visits) ?? [0]), 1);
  const totalDaysWithData = (summary?.perDay ?? []).filter(d => d.visits > 0).length;

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
            <BarChart3 className="w-6 h-6 text-teal-brand" />
            Website Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
            Visitor reports for {summary ? `${summary.month} ${summary.year}` : "…"} — visits, average time, and visitor locations.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="space-y-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Month</label>
            <select value={month} onChange={e => changePeriod(e.target.value, year)} className={selectBase}>
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Year</label>
            <select value={year} onChange={e => changePeriod(month, parseInt(e.target.value, 10))} className={selectBase}>
              {Array.from(new Set([...ranges.map(r => r.year), new Date().getFullYear(), new Date().getFullYear() - 1])).sort((a, b) => b - a).map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => loadSummary(month, year)}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => {
              if (!summary) {
                onShowToast("Load a report first — there is nothing to export yet.", "info");
                return;
              }
              downloadCsv(buildAnalyticsCsv(summary), `analytics-${summary.month.toLowerCase()}-${summary.year}.csv`);
              onShowToast(`Exported ${summary.month} ${summary.year} report as CSV.`, "success");
            }}
            disabled={!summary}
            className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-teal-brand/40 bg-teal-brand/10 text-teal-brand text-xs font-black uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
            title="Download the filtered report as a CSV file"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {ranges.length === 0 && !isLoading && summary === null && (
        <div className={`${cardBase} py-12 text-center`}>
          <div className="w-14 h-14 rounded-full bg-teal-brand/10 text-teal-brand flex items-center justify-center mx-auto mb-4">
            <MousePointerClick className="w-7 h-7" />
          </div>
          <h3 className="font-serif text-base font-black text-slate-800 dark:text-white">No visitor data yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
            Analytics begin the moment someone visits the website. Once visitors arrive, their visits,
            average time on site and locations will appear here automatically — no setup required.
          </p>
        </div>
      )}

      {summary && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={cardBase}>
              <div className="flex items-center justify-between">
                <span className="text-teal-brand"><Eye className="w-5 h-5" /></span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{summary.totalVisits.toLocaleString()}</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Visits</p>
            </div>
            <div className={cardBase}>
              <div className="flex items-center justify-between">
                <span className="text-sky-500"><Users className="w-5 h-5" /></span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{summary.uniqueVisitors.toLocaleString()}</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Unique Visitors</p>
            </div>
            <div className={cardBase}>
              <div className="flex items-center justify-between">
                <span className="text-amber-500"><Clock className="w-5 h-5" /></span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{fmtDuration(summary.avgDurationSec)}</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Avg. Time on Site</p>
            </div>
            <div className={cardBase}>
              <div className="flex items-center justify-between">
                <span className="text-emerald-500"><Calendar className="w-5 h-5" /></span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{totalDaysWithData}</p>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Active Days</p>
            </div>
          </div>

          {/* Daily visits chart */}
          <div className={`${cardBase} !space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-teal-brand" /> Visits per Day — {summary.month} {summary.year}
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">{summary.totalVisits} total</span>
            </div>
            <div className="flex items-end gap-[3px] h-36">
              {summary.perDay.map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                  <div className="relative w-full flex flex-1 items-end justify-center overflow-hidden">
                    <div
                      className={`w-full max-w-[14px] rounded-t-md transition-all duration-300 ${
                        d.visits > 0
                          ? "bg-gradient-to-t from-teal-brand to-emerald-300 dark:to-teal-brand/70 group-hover:opacity-80"
                          : "bg-slate-200/60 dark:bg-slate-800/60"
                      }`}
                      style={{ height: d.visits > 0 ? `${Math.max((d.visits / chartMax) * 100, 6)}%` : "2px" }}
                      title={`Day ${d.day}: ${d.visits} visit${d.visits === 1 ? "" : "s"}`}
                    />
                  </div>
                  <span className="text-[7px] font-bold text-slate-400 hidden sm:inline">{d.day}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Locations / devices / pages */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className={cardBase}>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-teal-brand" /> Top Countries
              </h3>
              {summary.countries.length === 0 ? <EmptyList /> : (
                <ul className="space-y-2">
                  {summary.countries.slice(0, 6).map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{c.country}</span>
                      <span className="font-mono font-black text-teal-brand">{c.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={cardBase}>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-sky-500" /> Visitor Languages
              </h3>
              {summary.locales.length === 0 ? <EmptyList /> : (
                <ul className="space-y-2">
                  {summary.locales.slice(0, 6).map((l, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{l.locale}</span>
                      <span className="font-mono font-black text-sky-500">{l.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={cardBase}>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-emerald-500" /> Devices
              </h3>
              {summary.devices.length === 0 ? <EmptyList /> : (
                <ul className="space-y-2">
                  {summary.devices.slice(0, 5).map((d, i) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-bold capitalize text-slate-700 dark:text-slate-300">
                        {deviceIcon(d.device)} {d.device}
                      </span>
                      <span className="font-mono font-black text-emerald-500">{d.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={cardBase}>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-500" /> Top Pages
              </h3>
              {summary.pages.length === 0 ? <EmptyList /> : (
                <ul className="space-y-2">
                  {summary.pages.slice(0, 6).map((p, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300 truncate">{p.page}</span>
                      <span className="font-mono font-black text-amber-500 shrink-0">{p.visits}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Recent visits table */}
          <div className={cardBase}>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Visits <span className="ml-1 text-teal-brand">({summary.recent.length})</span>
            </h3>
            {summary.recent.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No visits recorded for this period.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`${isDarkMode ? "bg-slate-950" : "bg-slate-50"} text-[10px] uppercase tracking-widest text-slate-400 font-black`}>
                      <th className="py-2.5 px-3">Time</th>
                      <th className="py-2.5 px-3">Page</th>
                      <th className="py-2.5 px-3">Location</th>
                      <th className="py-2.5 px-3">Device</th>
                      <th className="py-2.5 px-3 text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {summary.recent.map(r => (
                      <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {fmtTime(r.visitedAt)}
                          {r.isNew && <span className="ml-1.5 text-[8px] font-black uppercase bg-sky-500/10 text-sky-500 px-1.5 py-0.5 rounded">New</span>}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 truncate max-w-[180px]">{r.page || "/"}</td>
                        <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            {deviceIcon(r.device)} {r.device}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {fmtDuration(r.duration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyList() {
  return <p className="text-xs text-slate-400 py-4 text-center">No data</p>;
}
