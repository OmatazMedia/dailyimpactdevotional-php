import React, { useCallback, useEffect, useState } from "react";
import {
  Ban, CheckCircle, ShieldCheck, ShieldAlert, Download, RefreshCw,
  Lock, Unlock, ChevronLeft, ChevronRight, Loader2, AlertTriangle, Plus, X
} from "lucide-react";
import { API_BASE } from "../config/api";
import { apiDelete, apiPut } from "../lib/api";

interface IpBanRow {
  id: string; ipAddress: string; cidr: string; reason: string; email: string;
  source: string; failedAttempts: number; active: boolean; whitelisted: boolean; createdAt: string;
}
interface LoginEntry {
  id: string; email: string; timestamp: string; ip: string; userAgent: string;
  success: boolean; location?: string;
}
interface Paged<T> { items: T[]; total: number; page: number; pages: number; perPage: number; }

interface Props {
  isDarkMode: boolean;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

export default function IpBanPanel({ isDarkMode, showToast }: Props) {
  const [tab, setTab] = useState<"failed" | "bans">("bans");
  // Bans
  const [bans, setBans] = useState<IpBanRow[]>([]);
  const [bansPages, setBansPages] = useState(1);
  const [bansTotal, setBansTotal] = useState(0);
  const [banPage, setBanPage] = useState(1);
  const [banMonth, setBanMonth] = useState("");
  const [banYear, setBanYear] = useState("");
  const [banScope, setBanScope] = useState<"active" | "all" | "whitelisted">("active");
  const [bansLoading, setBansLoading] = useState(false);
  // Failed logins
  const [fails, setFails] = useState<LoginEntry[]>([]);
  const [failsPages, setFailsPages] = useState(1);
  const [failsTotal, setFailsTotal] = useState(0);
  const [failPage, setFailPage] = useState(1);
  const [failMonth, setFailMonth] = useState("");
  const [failYear, setFailYear] = useState("");
  const [failsLoading, setFailsLoading] = useState(false);
  // Selection + bulk
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // New ban form
  const [newIp, setNewIp] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  // Reschedule inline (per row)
  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedTime, setReschedTime] = useState("06:00");

  const card = `rounded-2xl border ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`;
  const input = `w-full py-2 pl-3 pr-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"}`;
  const sel = `py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"}`;

  const loadBans = useCallback(() => {
    setBansLoading(true);
    const q = new URLSearchParams({ page: String(banPage), perPage: "25", scope: banScope });
    if (banMonth) q.set("month", banMonth);
    if (banYear) q.set("year", banYear);
    fetch(`${API_BASE}/ip-bans.php?${q.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: Paged<IpBanRow> | null) => {
        if (d) { setBans(d.items ?? []); setBansPages(d.pages || 1); setBansTotal(d.total || 0); }
      })
      .catch(() => showToast("Unable to load IP bans.", "error"))
      .finally(() => setBansLoading(false));
  }, [banPage, banMonth, banYear, banScope, showToast]);

  const loadFails = useCallback(() => {
    setFailsLoading(true);
    const q = new URLSearchParams({ page: String(failPage), perPage: "25" });
    if (failMonth) q.set("month", failMonth);
    if (failYear) q.set("year", failYear);
    fetch(`${API_BASE}/login-log.php?${q.toString()}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: Paged<LoginEntry> | null) => {
        if (d) { setFails(d.items ?? []); setFailsPages(d.pages || 1); setFailsTotal(d.total || 0); }
      })
      .catch(() => showToast("Unable to load login audit.", "error"))
      .finally(() => setFailsLoading(false));
  }, [failPage, failMonth, failYear, showToast]);

  useEffect(() => { loadBans(); }, [loadBans]);
  useEffect(() => { loadFails(); }, [loadFails]);

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const bulkAction = async (action: string, successMsg: string) => {
    if (selected.size === 0) { showToast("Select at least one IP first.", "info"); return; }
    setBulkBusy(true);
    try {
      const res = await fetch(`${API_BASE}/ip-bans.php?action=${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Action failed");
      }
      showToast(successMsg, "success");
      setSelected(new Set());
      loadBans(); loadFails();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed.", "error");
    } finally { setBulkBusy(false); }
  };

  const createBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIp.trim()) { showToast("Enter an IP address to ban.", "info"); return; }
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE}/ip-bans.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ipAddress: newIp.trim(), reason: newReason.trim() || "Manual ban by admin", email: newEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to create ban");
      showToast(`IP ${newIp.trim()} banned.`, "success");
      setNewIp(""); setNewReason(""); setNewEmail("");
      loadBans();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to create ban.", "error");
    } finally { setIsCreating(false); }
  };

  const removeBan = async (id: string) => {
    try {
      await apiDelete(`${API_BASE}/ip-bans.php?id=${id}`);
      showToast("IP unban successful.", "success");
      loadBans();
    } catch {
      showToast("Failed to remove IP ban.", "error");
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exportCsv = (kind: "bans" | "fails") => {
    const q = new URLSearchParams({ format: "csv", perPage: "200" });
    if (kind === "bans") {
      q.set("scope", banScope);
      if (banMonth) q.set("month", banMonth);
      if (banYear) q.set("year", banYear);
    } else {
      if (failMonth) q.set("month", failMonth);
      if (failYear) q.set("year", failYear);
    }
    window.location.href = `${API_BASE}/${kind === "bans" ? "ip-bans.php" : "login-log.php"}?${q.toString()}`;
  };

  const Pager = ({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) => (
    <div className="flex items-center justify-between gap-2 pt-1">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        Page {page} of {pages}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}
          className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}
          className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-500 hover:bg-slate-100"}`}>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const FilterBar = ({ month, year, setMonth, setYear }: { month: string; year: string; setMonth: (v: string) => void; setYear: (v: string) => void }) => (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Month</label>
        <select value={month} onChange={e => { setMonth(e.target.value); }} className={sel}>
          <option value="">All months</option>
          {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Year</label>
        <select value={year} onChange={e => setYear(e.target.value)} className={sel}>
          <option value="">All years</option>
          {Array.from(new Set([new Date().getFullYear(), new Date().getFullYear() - 1])).sort((a, b) => b - a).map(y => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      </div>
      <button type="button" onClick={() => { if (tab === "bans") { setBanPage(1); loadBans(); } else { setFailPage(1); loadFails(); } }}
        className={`inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
        <RefreshCw className="w-3.5 h-3.5" /> Filter
      </button>
      <button type="button" onClick={() => exportCsv(tab === "bans" ? "bans" : "fails")}
        className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border border-teal-brand/30 bg-teal-brand/5 text-teal-brand text-[10px] font-black uppercase tracking-wider hover:bg-teal-brand hover:text-white transition-all">
        <Download className="w-3.5 h-3.5" /> Export CSV
      </button>
    </div>
  );

  return (
    <div className={`p-6 rounded-2xl border space-y-4 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <Ban className="w-4 h-4 text-teal-brand" />
          IP Ban &amp; Login Security
        </h3>
        <div className="flex gap-1.5">
          {([["bans", "Active Bans"], ["failed", "Failed Logins"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)}
              className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                tab === key ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "bans" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select value={banScope} onChange={e => { setBanScope(e.target.value as typeof banScope); setBanPage(1); }}
              className={sel}>
              <option value="active">Active bans</option>
              <option value="whitelisted">Whitelisted</option>
              <option value="all">All records</option>
            </select>
            <FilterBar month={banMonth} year={banYear} setMonth={setBanMonth} setYear={setBanYear} />
            <span className="text-[10px] font-bold text-slate-400">{bansTotal} record{bansTotal === 1 ? "" : "s"}</span>
          </div>

          {/* Bulk toolbar */}
          {selected.size > 0 && (
            <div className={`flex flex-wrap items-center gap-2 p-2.5 rounded-xl border animate-in fade-in ${isDarkMode ? "bg-teal-brand/5 border-teal-brand/20" : "bg-teal-brand/5 border-teal-brand/20"}`}>
              <span className="text-[10px] font-black uppercase tracking-wider text-teal-brand">{selected.size} selected</span>
              <button type="button" disabled={bulkBusy} onClick={() => bulkAction("bulk-unban", "Selected IPs unbanned.")}
                className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-40">
                <Unlock className="w-3 h-3" /> Unban
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => bulkAction("bulk-whitelist", "Selected IPs whitelisted — they can never be auto-banned.")}
                className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500 hover:text-white transition-all disabled:opacity-40">
                <ShieldCheck className="w-3 h-3" /> Whitelist
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => bulkAction("bulk-unwhitelist", "Whitelist removed from selected IPs.")}
                className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition-all disabled:opacity-40">
                <X className="w-3 h-3" /> Remove whitelist
              </button>
              <button type="button" onClick={() => setSelected(new Set())}
                className="py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                Clear
              </button>
            </div>
          )}

          {/* Create ban */}
          <form onSubmit={createBan} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div className="space-y-1">
              <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">IP to ban</label>
              <input type="text" placeholder="e.g. 192.168.1.1" value={newIp} onChange={e => setNewIp(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Reason (optional)</label>
              <input type="text" placeholder="Suspicious activity" value={newReason} onChange={e => setNewReason(e.target.value)} className={input} />
            </div>
            <div className="space-y-1">
              <label className="block text-[9px] uppercase text-slate-400 font-bold tracking-wider">Email (optional)</label>
              <input type="email" placeholder="user@example.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={input} />
            </div>
            <button type="submit" disabled={isCreating}
              className="sm:col-span-3 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-rose-500 text-white hover:bg-rose-600 transition-opacity active:scale-[0.98] disabled:opacity-50">
              {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {isCreating ? "Creating Ban..." : "Create IP Ban"}
            </button>
          </form>

          {/* Bans list */}
          <div className="space-y-2">
            {bansLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-brand" /></div>
            ) : bans.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-3 text-center">No {banScope === "active" ? "active" : banScope} IP bans{banMonth ? ` for ${banMonth}` : ""}.</p>
            ) : (
              bans.map(ban => (
                <div key={ban.id} className={`p-3 rounded-lg border flex items-start justify-between gap-2 ${isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-start gap-2.5 flex-1 min-w-0">
                    <input type="checkbox" checked={selected.has(ban.id)} onChange={() => toggleSelect(ban.id)}
                      className="mt-0.5 w-3.5 h-3.5 accent-teal-brand cursor-pointer" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">{ban.ipAddress}</p>
                        {ban.whitelisted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[9px] font-black uppercase tracking-wider">
                            <ShieldCheck className="w-2.5 h-2.5" /> Whitelisted
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">CIDR: {ban.cidr} • {ban.reason}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {new Date(ban.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {ban.email ? ` • ${ban.email}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {ban.whitelisted ? (
                      <button type="button" onClick={() => toggleWhitelist(ban.id, false)} title="Remove whitelist"
                        className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button type="button" onClick={() => toggleWhitelist(ban.id, true)} title="Whitelist (never auto-banned)"
                        className="p-1.5 rounded-lg bg-sky-500/10 text-sky-500 hover:bg-sky-500 hover:text-white transition-colors">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {ban.active && (
                      <button type="button" onClick={() => removeBan(ban.id)} title="Unban IP"
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors">
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            <Pager page={banPage} pages={bansPages} onPage={setBanPage} />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <FilterBar month={failMonth} year={failYear} setMonth={setFailMonth} setYear={setFailYear} />
            <span className="text-[10px] font-bold text-slate-400">{failsTotal} attempt{failsTotal === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-2">
            {failsLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-brand" /></div>
            ) : fails.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-3 text-center">No failed login attempts recorded.</p>
            ) : (
              fails.map(log => (
                <div key={log.id} className={`p-3 rounded-lg border flex items-start justify-between gap-2 ${isDarkMode ? "bg-slate-950 border-rose-900/30" : "bg-rose-50/50 border-rose-100"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">{log.email || "(no email)"}</p>
                    <p className="text-[10px] font-mono text-slate-500 truncate">
                      {log.ip} • {new Date(log.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{log.location || "Location unknown"}</p>
                  </div>
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-1" />
                </div>
              ))
            )}
            <Pager page={failPage} pages={failsPages} onPage={setFailPage} />
          </div>
        </div>
      )}
    </div>
  );

  async function toggleWhitelist(id: string, whitelisted: boolean) {
    try {
      // apiPut sends ?_method=PUT — cPanel ModSecurity blocks raw PUT verbs.
      await apiPut(`${API_BASE}/ip-bans.php?id=${id}`, { whitelisted });
      showToast(whitelisted ? "IP whitelisted — it can never be auto-banned." : "Whitelist removed.", "success");
      loadBans();
    } catch {
      showToast("Failed to update whitelist.", "error");
    }
  }
}
