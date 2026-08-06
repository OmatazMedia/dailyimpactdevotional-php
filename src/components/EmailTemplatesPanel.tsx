import React, { useEffect, useState } from "react";
import { FileText, Save, Loader2, RefreshCw, Copy, Check, Palette } from "lucide-react";
import { API_BASE } from "../config/api";
import { apiPut } from "../lib/api";

interface Template {
  key: string;
  subject: string;
  body: string;
}
interface Branding {
  siteName: string;
  siteLogoUrl: string;
  socialFacebook: string;
  socialTwitter: string;
  socialInstagram: string;
  socialYoutube: string;
}
interface Props {
  isDarkMode: boolean;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

const TOKEN_HELP: Record<string, string[]> = {
  login_notification: ["{{login_email}}", "{{login_ip}}", "{{login_time}}", "{{login_location}}", "{{login_browser}}", "{{secureall_url}}", "{{reset_url}}"],
  failed_login_alert: ["{{login_email}}", "{{login_ip}}", "{{login_time}}", "{{login_location}}", "{{login_browser}}", "{{attempts_remaining}}"],
  donor_receipt: ["{{donor_name}}", "{{donation_amount}}", "{{donation_currency}}", "{{donation_reference}}", "{{donation_date}}"],
  password_reset: ["{{reset_url}}"],
  new_ip_ban: ["{{ban_ip}}", "{{ban_cidr}}", "{{ban_reason}}"],
  ip_unbanned: ["{{ban_ip}}", "{{unban_by}}"],
};

const LABELS: Record<string, string> = {
  login_notification: "Admin Login Notification",
  failed_login_alert: "Failed Login Alert",
  donor_receipt: "Donor Receipt (Thank You)",
  password_reset: "Password Reset",
  new_ip_ban: "New IP Ban Alert",
  ip_unbanned: "IP Unbanned Alert",
};

export default function EmailTemplatesPanel({ isDarkMode, showToast }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [branding, setBranding] = useState<Branding>({ siteName: "Daily Impact Devotional", siteLogoUrl: "", socialFacebook: "", socialTwitter: "", socialInstagram: "", socialYoutube: "" });
  const [activeKey, setActiveKey] = useState("donor_receipt");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");

  const card = `p-6 rounded-2xl border space-y-4 ${isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`;
  const input = `w-full py-2 px-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"}`;

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/email-config.php?action=templates`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { templates?: Template[]; branding?: Branding } | null) => {
        if (!d) return;
        if (Array.isArray(d.templates) && d.templates.length > 0) {
          setTemplates(d.templates);
          setActiveKey(prev => d.templates!.some(t => t.key === prev) ? prev : d.templates![0].key);
        }
        if (d.branding) setBranding({ ...branding, ...d.branding });
      })
      .catch(() => showToast("Unable to load email templates.", "error"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const active = templates.find(t => t.key === activeKey);

  const updateActive = (patch: Partial<Template>) => {
    setTemplates(prev => prev.map(t => t.key === activeKey ? { ...t, ...patch } : t));
  };

  const save = async () => {
    setSaving(true);
    try {
      // apiPut sends ?_method=PUT — cPanel ModSecurity blocks raw PUT verbs.
      await apiPut(`${API_BASE}/email-config.php?action=templates`, { templates, branding });
      showToast("Email templates saved — all future emails use them.", "success");
    } catch {
      showToast("Unable to save email templates.", "error");
    } finally { setSaving(false); }
  };

  const copyToken = (tok: string) => {
    navigator.clipboard?.writeText(tok).then(() => {
      setCopied(tok);
      setTimeout(() => setCopied(""), 1500);
    }).catch(() => {});
  };

  return (
    <div className={`${card} md:col-span-2`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-teal-brand" />
          Email Templates &amp; Branding
        </h3>
        <button type="button" onClick={load} disabled={loading}
          className={`inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${isDarkMode ? "border-slate-700 text-slate-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-900"}`}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Reload
        </button>
      </div>

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-teal-brand" /></div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] leading-relaxed text-slate-500">
            Every automated email is wrapped in a branded, mobile-friendly design — logo header, your content, and a social footer.
            Edit the subject + body of each template below. Use the <b>token chips</b> to insert live values (donor name, amount, IP, links…).
            Leaving a field untouched keeps the built-in default.
          </p>

          {/* Template picker */}
          <div className="flex flex-wrap gap-1.5">
            {templates.map(t => (
              <button key={t.key} type="button" onClick={() => setActiveKey(t.key)}
                className={`py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                  activeKey === t.key ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400 hover:text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"}`}>
                {LABELS[t.key] || t.key}
              </button>
            ))}
          </div>

          {active && (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Subject</label>
                <input type="text" value={active.subject} onChange={e => updateActive({ subject: e.target.value })} className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Body (HTML)</label>
                <textarea
                  value={active.body}
                  onChange={e => updateActive({ body: e.target.value })}
                  rows={12}
                  className={`${input} font-mono text-xs leading-relaxed`}
                />
              </div>

              {/* Token chips */}
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Insert:</span>
                {(TOKEN_HELP[active.key] || []).map(tok => (
                  <button key={tok} type="button" onClick={() => copyToken(tok)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[10px] transition-all ${
                      copied === tok ? "border-teal-brand text-teal-brand" : isDarkMode ? "border-slate-700 text-slate-300 hover:border-teal-brand/50" : "border-slate-200 text-slate-500 hover:border-teal-brand/50"}`}>
                    {copied === tok ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {tok}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Branding */}
          <div className={`p-4 rounded-xl border space-y-3 ${isDarkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
            <p className="font-black uppercase tracking-wider text-[10px] text-slate-400 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-teal-brand" /> Email branding (header logo + footer social links)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Site name</label>
                <input type="text" value={branding.siteName} onChange={e => setBranding(b => ({ ...b, siteName: e.target.value }))} className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Logo URL (absolute or /path)</label>
                <input type="text" value={branding.siteLogoUrl} onChange={e => setBranding(b => ({ ...b, siteLogoUrl: e.target.value }))} placeholder="https://yoursite.com/assets/images/dailyimpact.png" className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Facebook</label>
                <input type="text" value={branding.socialFacebook} onChange={e => setBranding(b => ({ ...b, socialFacebook: e.target.value }))} className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">X / Twitter</label>
                <input type="text" value={branding.socialTwitter} onChange={e => setBranding(b => ({ ...b, socialTwitter: e.target.value }))} className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Instagram</label>
                <input type="text" value={branding.socialInstagram} onChange={e => setBranding(b => ({ ...b, socialInstagram: e.target.value }))} className={input} />
              </div>
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">YouTube</label>
                <input type="text" value={branding.socialYoutube} onChange={e => setBranding(b => ({ ...b, socialYoutube: e.target.value }))} className={input} />
              </div>
            </div>
          </div>

          <button type="button" onClick={save} disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-teal-brand text-white hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save Templates & Branding"}
          </button>
        </div>
      )}
    </div>
  );
}
