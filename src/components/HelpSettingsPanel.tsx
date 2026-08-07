import React, { useCallback, useEffect, useState } from "react";
import { BookOpen, HelpCircle, Plus, Trash2, Pencil, X, Check, Save } from "lucide-react";
import { API_BASE } from "../config/api";

/**
 * Settings → Help — lets the Administrator create custom guides that appear in
 * the dashboard Help Center (alongside the built-in ones), assigned to any
 * section so the usual role filtering applies automatically.
 */

const SECTIONS: { key: string; label: string }[] = [
  { key: "overview", label: "Overview Console" },
  { key: "add-devotional", label: "Add Devotional" },
  { key: "manage-devotionals", label: "List Devotionals" },
  { key: "import-devotional", label: "Import Devotional" },
  { key: "header-images", label: "Header Images" },
  { key: "user-management", label: "User Management" },
  { key: "telegram-integration", label: "Telegram Channel" },
  { key: "foreword", label: "Foreword" },
  { key: "payments", label: "Payments & Donations" },
  { key: "analytics", label: "Website Analytics" },
  { key: "settings", label: "Settings" },
];

const SUBTABS = ["profile", "security", "assets", "email", "templates", "payments", "roles"];

interface StoredTopic {
  id: string;
  section: string;
  title: string;
  summary: string;
  keywords: string[];
  goTo: { tab: string; subTab?: string };
  body: string;
}

interface HelpSettingsPanelProps {
  isDarkMode: boolean;
  showToast: (msg: string, type?: "success" | "error" | "info") => void;
}

const inputCls = (dark: boolean) =>
  `w-full py-2 px-3 rounded-xl text-xs border focus:outline-none ${
    dark ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
  }`;

export default function HelpSettingsPanel({ isDarkMode, showToast }: HelpSettingsPanelProps) {
  const [topics, setTopics] = useState<StoredTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, "new" = create form
  const [saving, setSaving] = useState(false);

  // Editor form state
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("overview");
  const [summary, setSummary] = useState("");
  const [keywords, setKeywords] = useState("");
  const [body, setBody] = useState("");
  const [goTab, setGoTab] = useState("overview");
  const [goSubTab, setGoSubTab] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API_BASE}/help.php`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { success?: boolean; topics?: StoredTopic[] } | null) => {
        if (d?.success && Array.isArray(d.topics)) setTopics(d.topics);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const startNew = () => {
    setEditingId("new");
    setTitle("");
    setSection("overview");
    setSummary("");
    setKeywords("");
    setBody("");
    setGoTab("overview");
    setGoSubTab("");
  };

  const startEdit = (t: StoredTopic) => {
    setEditingId(t.id);
    setTitle(t.title);
    setSection(t.section);
    setSummary(t.summary || "");
    setKeywords((t.keywords || []).join(", "));
    setBody(t.body || "");
    setGoTab(t.goTo?.tab || "overview");
    setGoSubTab(t.goTo?.subTab || "");
  };

  const cancelEdit = () => setEditingId(null);

  const saveTopic = async () => {
    if (!title.trim() || !body.trim()) {
      showToast("Title and body are required.", "error");
      return;
    }
    setSaving(true);
    const topic: StoredTopic = {
      id: editingId === "new" ? "" : (editingId ?? ""),
      section,
      title: title.trim(),
      summary: summary.trim(),
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      goTo: { tab: goTab, subTab: goSubTab || undefined },
      body: body.trim(),
    };
    try {
      const res = await fetch(`${API_BASE}/help.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", topic }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; message?: string; topics?: StoredTopic[] };
      if (data.success) {
        if (Array.isArray(data.topics)) setTopics(data.topics);
        setEditingId(null);
        showToast(editingId === "new" ? "Guide created — it's now in the Help Center." : "Guide updated.");
      } else {
        showToast(data.message || "Failed to save the guide.", "error");
      }
    } catch {
      showToast("Could not reach the server.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteTopic = async (id: string, name: string) => {
    if (!window.confirm(`Delete the guide "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API_BASE}/help.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; topics?: StoredTopic[] };
      if (data.success) {
        if (Array.isArray(data.topics)) setTopics(data.topics);
        if (editingId === id) setEditingId(null);
        showToast("Guide deleted.");
      } else {
        showToast("Failed to delete the guide.", "error");
      }
    } catch {
      showToast("Could not reach the server.", "error");
    }
  };

  const sectionLabel = (k: string) => SECTIONS.find((s) => s.key === k)?.label ?? k;

  const cardCls = `rounded-2xl border p-5 space-y-5 ${
    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  }`;
  const labelCls = "block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]";

  return (
    <div className="space-y-5">
      {/* Intro */}
      <div className={`${cardCls} !p-4 flex items-start gap-3`}>
        <div className="w-9 h-9 rounded-full bg-teal-brand/15 text-teal-brand flex items-center justify-center shrink-0">
          <BookOpen className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <h3 className="font-serif text-xs font-black uppercase tracking-wider">Custom Help Guides</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 font-semibold">
            Write your own walkthroughs for the team. Each guide appears in the Help Center (the "?" button) inside
            the section you choose, so staff roles only ever see guides for sections they can open.
          </p>
        </div>
      </div>

      {/* Editor form */}
      {editingId !== null && (
        <div className={cardCls}>
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5 text-teal-brand" />
              {editingId === "new" ? "New Guide" : "Edit Guide"}
            </h3>
            <button onClick={cancelEdit} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1 md:col-span-2">
              <label className={labelCls}>Title *</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120}
                placeholder="e.g. How to schedule next month's posts" className={inputCls(isDarkMode)} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Section (shows it in)</label>
              <select value={section} onChange={(e) => setSection(e.target.value)} className={inputCls(isDarkMode)}>
                {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Search keywords (comma separated)</label>
              <input type="text" value={keywords} onChange={(e) => setKeywords(e.target.value)} maxLength={200}
                placeholder="scheduler, bulk, month" className={inputCls(isDarkMode)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className={labelCls}>Summary (shown under the title)</label>
              <input type="text" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={200}
                placeholder="A one-line description of this guide" className={inputCls(isDarkMode)} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className={labelCls}>Body *</label>
              <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000}
                placeholder={"Write your walkthrough here.\n\nStart a line with ## to make a heading\n- Start a line with - to make a bullet\nLeave a blank line between paragraphs"}
                className={inputCls(isDarkMode)} />
              <p className="text-[10px] text-slate-400 font-semibold">
                <b>## Heading</b> · <b>- bullet</b> · blank line = new paragraph. {body.length}/4000
              </p>
            </div>
            <div className="space-y-1">
              <label className={labelCls}>"Go to" page</label>
              <select value={goTab} onChange={(e) => { setGoTab(e.target.value); setGoSubTab(""); }} className={inputCls(isDarkMode)}>
                {SECTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            {goTab === "settings" && (
              <div className="space-y-1">
                <label className={labelCls}>Settings sub-tab</label>
                <select value={goSubTab} onChange={(e) => setGoSubTab(e.target.value)} className={inputCls(isDarkMode)}>
                  <option value="">(top of Settings)</option>
                  {SUBTABS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={cancelEdit} className="py-2 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
            <button onClick={saveTopic} disabled={saving}
              className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-teal-brand text-white text-[11px] font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50">
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save Guide"}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {editingId === null && (
        <button onClick={startNew}
          className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-teal-brand text-white text-[11px] font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all">
          <Plus className="w-3.5 h-3.5" />
          New Guide
        </button>
      )}

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-xs text-slate-400 italic font-semibold">Loading guides…</div>
      ) : topics.length === 0 ? (
        <div className={`${cardCls} text-center py-10`}>
          <HelpCircle className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs text-slate-400 italic font-semibold">
            No custom guides yet — click "New Guide" to add your first one.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {topics.map((t) => (
            <div key={t.id} className={`${cardCls} !p-4 flex items-start justify-between gap-3`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black text-slate-800 dark:text-white">{t.title}</span>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-teal-brand/10 text-teal-brand">
                    {sectionLabel(t.section)}
                  </span>
                </div>
                {t.summary && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-semibold">{t.summary}</p>}
                <p className="mt-1 text-[10px] text-slate-400 font-semibold">
                  Opens: {sectionLabel(t.goTo?.tab || t.section)}{t.goTo?.subTab ? ` → ${t.goTo.subTab}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => startEdit(t)} title="Edit"
                  className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-teal-brand flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => deleteTopic(t.id, t.title)} title="Delete"
                  className="w-7 h-7 rounded-lg border border-rose-200 dark:border-rose-950 text-rose-500 hover:bg-rose-500/10 flex items-center justify-center">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
