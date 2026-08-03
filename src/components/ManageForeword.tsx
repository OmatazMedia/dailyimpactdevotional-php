import React, { useState, useEffect, useRef } from "react";
import {
  Save, Trash2, Plus, Eye, EyeOff,
  RotateCcw, RotateCw,
  BookOpen, Clock, User
} from "lucide-react";
import Quill from "quill";
import "quill/dist/quill.snow.css";
import { ForewordPost } from "../types";
import { API_BASE } from "../config/api";
import { apiDelete } from "../lib/api";

interface ManageForewordProps {
  isDarkMode: boolean;
  onShowToast: (msg: string, type?: "success" | "error" | "info") => void;
}

// Load all foreword posts from the API (newest first, per the backend ORDER BY).
async function fetchForewordPosts(): Promise<ForewordPost[]> {
  const res = await fetch(`${API_BASE}/foreword.php`);
  if (!res.ok) throw new Error("Failed to load foreword posts (HTTP " + res.status + ")");
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// Create a new foreword post — the backend generates the id and sets
// published_at from the DB default (no client-supplied datetime to corrupt).
async function createForewordPost(payload: {
  title: string;
  content: string;
  author: string;
}): Promise<ForewordPost> {
  const res = await fetch(`${API_BASE}/foreword.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save foreword (HTTP " + res.status + ")");
  const json = await res.json();
  return {
    id: json.id,
    title: json.title,
    content: json.content,
    author: json.author,
    publishedAt: json.publishedAt,
    updatedAt: json.updatedAt,
  };
}

// Update an existing foreword post by id (backend only touches title/content/author).
async function updateForewordPost(id: string, payload: {
  title: string;
  content: string;
  author: string;
}): Promise<void> {
  const res = await fetch(`${API_BASE}/foreword.php?id=${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update foreword (HTTP " + res.status + ")");
}

// Delete a foreword post by id — uses apiDelete so hosts that block the raw
// DELETE verb (cPanel/ModSecurity) still work via the POST ?_method=DELETE path.
async function deleteForewordPost(id: string): Promise<void> {
  await apiDelete(`/foreword.php?id=${encodeURIComponent(id)}`);
}

/**
 * Normalize legacy HTML before loading it into Quill. Older foreword posts were
 * saved with inline styles like <p style="text-align:justify"> — Quill ignores
 * inline styles, so we convert them to its native align classes (ql-align-*)
 * so alignment survives a round-trip through the editor.
 */
function normalizeLegacyHtml(html: string): string {
  return html.replace(
    /(<(?:p|div|h[1-6]|blockquote|li|td)[^>]*?)\sstyle="text-align:\s*(left|center|right|justify)"([^>]*>)/gi,
    (_m, pre: string, align: string, post: string) =>
      `${pre} class="ql-align-${align}"${post}`
  );
}

export default function ManageForeword({ isDarkMode, onShowToast }: ManageForewordProps) {
  const [posts, setPosts] = useState<ForewordPost[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPreview, setIsPreview] = useState(false);

  // Editor state (content is the HTML the Quill editor produces)
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Quill WYSIWYG editor refs
  const toolbarRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);

  // Initialize Quill once. The ref guard makes this safe under React
  // StrictMode's double-mount in development.
  useEffect(() => {
    if (!editorRef.current || !toolbarRef.current || quillRef.current) return;
    const quill = new Quill(editorRef.current, {
      theme: "snow",
      modules: {
        toolbar: toolbarRef.current,
        history: { userOnly: true },
      },
      placeholder: "Write the foreword message here. Paste from Word or anywhere — formatting is kept automatically.",
    });
    quillRef.current = quill;
    // Keep React state in sync with the editor so Save/Preview always use
    // the latest HTML (and undo/redo steps update it too).
    quill.on("text-change", () => {
      setContent(quill.root.innerHTML);
    });
  }, []);

  // Load the selected post (or blank for a new foreword) into the editor.
  // Runs after Quill is mounted and whenever the selection/list refreshes.
  useEffect(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const post = posts.find(p => p.id === selectedId);
    const targetHtml = normalizeLegacyHtml(post ? post.content : "");
    // Never clobber the editor if it already holds the target content
    // (e.g. after a save-refresh round-trip). Only reset the undo history
    // when content actually changed — otherwise the user's typing history
    // would be wiped by every refresh.
    if (quill.root.innerHTML !== targetHtml) {
      quill.clipboard.dangerouslyPasteHTML(targetHtml);
      quill.getModule("history").clear?.();
    }
  }, [selectedId, posts]);

  // Sync content from API on mount
  useEffect(() => {
    fetchForewordPosts()
      .then((data) => {
        setPosts(data);
        setSelectedId(prev => (data.some(p => p.id === prev) ? prev : (data[0]?.id ?? null)));
      })
      .catch(() => {});
  }, []);

  const undo = () => quillRef.current?.getModule("history").undo();
  const redo = () => quillRef.current?.getModule("history").redo();

  const handleSave = async () => {
    if (!title.trim()) { onShowToast("Please enter a title.", "error"); return; }

    const quill = quillRef.current;
    const plainText = quill ? quill.getText().trim() : "";
    const htmlContent = quill ? quill.root.innerHTML : content;
    if (!plainText) { onShowToast("Please enter content.", "error"); return; }

    const editing = !!(selectedId && posts.some(p => p.id === selectedId));
    const payload = { title, content: htmlContent, author: "Dr. Andy Osakwe" };
    let createdId: string | null = null;

    try {
      if (editing) {
        await updateForewordPost(selectedId!, payload);
      } else {
        createdId = (await createForewordPost(payload)).id;
      }
      onShowToast("Foreword saved successfully!", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      onShowToast(`Failed to save foreword: ${msg}`, "error");
      return;
    }
    // Best-effort refresh — the write already succeeded, so a refresh hiccup
    // must NOT turn the success toast into a fake failure. Selection is updated
    // ONLY after posts is fresh so the [selectedId] editor effect loads the
    // just-created post (setting it earlier would blank the editor).
    try {
      const fresh = await fetchForewordPosts();
      setPosts(fresh);
      if (!editing) {
        setSelectedId(createdId && fresh.some(p => p.id === createdId)
          ? createdId
          : (fresh[0]?.id ?? null));
      }
    } catch {
      // Keep current list; next mount/tab visit will re-sync.
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteForewordPost(id);
      onShowToast("Foreword post deleted.", "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      onShowToast(`Failed to delete foreword: ${msg}`, "error");
      return;
    }
    // Best-effort refresh — never turn a successful delete into a fake failure.
    try {
      const fresh = await fetchForewordPosts();
      setPosts(fresh);
      setSelectedId(prev => (fresh.some(p => p.id === prev) ? prev : (fresh[0]?.id ?? null)));
    } catch {
      // Keep current list; next mount/tab visit will re-sync.
    }
  };

  const handleNew = () => {
    setSelectedId(null);
    setTitle("");
    setIsPreview(false);
  };

  const inputBase = `w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 focus:border-teal-brand transition-all ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
  }`;

  const toolBtn = `p-1.5 rounded-lg transition-colors ${
    isDarkMode
      ? "text-slate-400 hover:text-white hover:bg-slate-800"
      : "text-slate-500 hover:text-slate-900 hover:bg-slate-200"
  }`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

      {/* Left: Post list */}
      <div className="lg:col-span-1 space-y-3">
        <button
          onClick={handleNew}
          className="w-full py-2 px-3 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 hover:opacity-90 transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> New Foreword
        </button>

        <div className="space-y-2">
          {posts.length === 0 && (
            <p className="text-xs text-slate-400 italic text-center py-6">No posts yet. Create one.</p>
          )}
          {posts.map(p => (
            <div
              key={p.id}
              onClick={() => { setSelectedId(p.id); setIsPreview(false); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all group ${
                selectedId === p.id
                  ? "border-teal-brand bg-teal-brand/10"
                  : isDarkMode
                    ? "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                    : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${selectedId === p.id ? "text-teal-brand" : isDarkMode ? "text-white" : "text-slate-900"}`}>
                    {p.title}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {new Date(p.publishedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-rose-400 hover:bg-rose-500/10 transition-all shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Editor */}
      <div className={`lg:col-span-3 rounded-2xl border p-6 space-y-5 ${
        isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}>
        {/* Editor header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className={`font-serif font-black text-sm uppercase tracking-wider ${isDarkMode ? "text-white" : "text-slate-900"}`}>
            <BookOpen className="w-4 h-4 inline mr-1.5 text-teal-brand" />
            {selectedId && posts.some(p => p.id === selectedId) ? "Edit Foreword" : "New Foreword"}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPreview(!isPreview)}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                isPreview
                  ? "bg-teal-brand text-white border-teal-brand"
                  : isDarkMode ? "border-slate-700 text-slate-300 hover:border-teal-brand" : "border-slate-200 text-slate-600 hover:border-teal-brand"
              }`}
            >
              {isPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {isPreview ? "Edit" : "Preview"}
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 py-1.5 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider bg-teal-brand text-white hover:opacity-90 transition-all"
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Title</label>
          <input
            type="text"
            placeholder="Enter foreword title..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={inputBase}
          />
        </div>

        {/* Message */}
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Message</label>

          {/* Editor — always mounted so Quill's DOM survives preview toggles */}
          <div className={`rounded-2xl border overflow-hidden ${isPreview ? "hidden" : ""} ${isDarkMode ? "border-slate-800" : "border-slate-200"}`}>
            {/* Quill toolbar + undo/redo */}
            <div className={`flex items-center gap-1 border-b px-2 py-1.5 ${isDarkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <div ref={toolbarRef} className="flex-1 min-w-0" />
              <div className={`flex items-center gap-1 pl-2 border-l ${isDarkMode ? "border-slate-700" : "border-slate-200"}`}>
                <button type="button" title="Undo (Ctrl+Z)" onClick={undo} className={toolBtn}>
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button type="button" title="Redo (Ctrl+Shift+Z)" onClick={redo} className={toolBtn}>
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {/* WYSIWYG editing area (Quill mounts here) */}
            <div
              ref={editorRef}
              className={isDarkMode ? "bg-slate-900 text-slate-200" : "bg-white text-slate-800"}
            />
          </div>

          {/* Preview mode (hidden while editing) */}
          <div className={`rounded-2xl border min-h-64 p-6 ${isPreview ? "" : "hidden"} ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"}`}>
            {content.replace(/<[^>]*>/g, "").trim() ? (
              <div
                className={`prose prose-sm max-w-none leading-relaxed ${isDarkMode ? "prose-invert text-slate-300" : "text-slate-800"}`}
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
              <p className="text-slate-400 italic text-sm text-center py-12">Nothing to preview yet.</p>
            )}
          </div>
        </div>

        {/* Author hint */}
        <p className={`text-[10px] flex items-center gap-1 ${isDarkMode ? "text-slate-600" : "text-slate-400"}`}>
          <User className="w-3 h-3" /> Published as Dr. Andy Osakwe
        </p>
      </div>
    </div>
  );
}
