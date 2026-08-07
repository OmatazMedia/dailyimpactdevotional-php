import React, { useState } from "react";
import {
  Type,
  AlignLeft,
  MousePointerClick,
  Image as ImageIcon,
  Minus,
  MoveVertical,
  Table as TableIcon,
  Trash2,
  GripVertical,
  Plus,
  Copy,
  Check,
} from "lucide-react";

// ─── Block model ─────────────────────────────────────────────────────────────
export type EmailBlock =
  | { id: string; type: "heading"; text: string; align: "left" | "center" | "right"; color: string }
  | { id: string; type: "text"; text: string; align: "left" | "center" | "right" }
  | { id: string; type: "button"; label: string; url: string; align: "left" | "center" | "right" }
  | { id: string; type: "image"; src: string; alt: string; align: "center" | "left" | "right"; width: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height: number }
  | { id: string; type: "table"; rows: { label: string; value: string }[] };

export type BlockType = EmailBlock["type"];

const uid = () => Math.random().toString(36).slice(2, 10);

export function makeBlock(type: BlockType): EmailBlock {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, text: "Your heading here", align: "center", color: "#0f172a" };
    case "text": return { id, type, text: "Add your message text here. Tokens like {{donor_name}} are filled in automatically when the email is sent.", align: "left" };
    case "button": return { id, type, label: "Click here", url: "https://", align: "center" };
    case "image": return { id, type, src: "", alt: "", align: "center", width: "100" };
    case "divider": return { id, type };
    case "spacer": return { id, type, height: 24 };
    case "table": return { id, type, rows: [{ label: "Label", value: "Value" }] };
  }
}

// ─── Block → HTML (the fragment the email engine wraps in the branded shell) ─
const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Only real hex colours survive serialization — blocks CSS injection via the
// style attribute (quotes are escaped, but ";" alone could smuggle extra CSS).
const safeColor = (c: string) => (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : "#0f172a");

export function blocksToHtml(blocks: EmailBlock[]): string {
  return blocks.map((b) => {
    switch (b.type) {
      case "heading":
        return `<h2 style="margin:0 0 14px;color:${safeColor(b.color)};font-size:20px;line-height:1.3;text-align:${b.align};">${esc(b.text)}</h2>`;
      case "text":
        return `<p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;text-align:${b.align};">${esc(b.text)}</p>`;
      case "button":
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td align="${b.align}" style="padding:4px 0;"><a href="${esc(b.url)}" style="display:inline-block;padding:12px 26px;border-radius:10px;background:#0d9488;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">${esc(b.label)}</a></td></tr></table>`;
      case "image":
        return `<div style="text-align:${b.align};margin:0 0 16px;"><img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${esc(b.width)}%" style="max-width:100%;height:auto;border-radius:10px;" /></div>`;
      case "divider":
        return `<hr style="border:0;border-top:1px solid #e2e8f0;margin:18px 0;" />`;
      case "spacer":
        return `<div style="height:${Math.max(4, Math.min(120, b.height))}px;">&nbsp;</div>`;
      case "table":
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:0 0 18px;">${b.rows.map((r) =>
          `<tr><td style="background:#f8fafc;padding:10px 16px;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">${esc(r.label)}</td></tr>` +
          `<tr><td style="padding:12px 16px;color:#334155;font-size:14px;">${esc(r.value)}</td></tr>`
        ).join("")}</table>`;
    }
  }).join("\n");
}

// ─── HTML → Blocks (best-effort conversion of existing/legacy templates) ─────
export function htmlToBlocks(html: string): EmailBlock[] | null {
  if (!html) return null;
  const blocks: EmailBlock[] = [];
  const master = /<h2[^>]*>([\s\S]*?)<\/h2>|<p[^>]*>([\s\S]*?)<\/p>|<img[^>]*src="([^"]*)"[^>]*>|<hr[^>]*\/?>|<table[^>]*>([\s\S]*?)<\/table>|<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = master.exec(html)) !== null) {
    if (m[1] !== undefined) {
      blocks.push({ id: uid(), type: "heading", text: stripTags(m[1]), align: "center", color: "#0f172a" });
    } else if (m[2] !== undefined) {
      blocks.push({ id: uid(), type: "text", text: stripTags(m[2]), align: "left" });
    } else if (m[3] !== undefined) {
      blocks.push({ id: uid(), type: "image", src: m[3], alt: "", align: "center", width: "100" });
    } else if (m[4] !== undefined) {
      // Table: button wrapper or label/value detail table.
      if (/<a[^>]*href=/.test(m[4])) {
        const a = m[4].match(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
        if (a) blocks.push({ id: uid(), type: "button", label: stripTags(a[2]), url: a[1], align: "center" });
      } else {
        const rows: { label: string; value: string }[] = [];
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let tr: RegExpExecArray | null;
        let pendingLabel: string | null = null;
        while ((tr = trRe.exec(m[4])) !== null) {
          const cells = tr[1].split(/<\/td>/).map((c) => stripTags(c.replace(/<td[^>]*>/g, ""))).filter((c) => c !== "");
          for (const cell of cells) {
            if (pendingLabel === null) pendingLabel = cell;
            else { rows.push({ label: pendingLabel, value: cell }); pendingLabel = null; }
          }
        }
        if (rows.length > 0) blocks.push({ id: uid(), type: "table", rows });
      }
    } else if (m[5] !== undefined && m[6] !== undefined) {
      blocks.push({ id: uid(), type: "button", label: stripTags(m[6]), url: m[5], align: "center" });
    } else if (m[0] && /^<hr/.test(m[0])) {
      blocks.push({ id: uid(), type: "divider" });
    }
  }
  return blocks.length > 0 ? blocks : null;
}

// ─── Palette + Canvas + Inspector ────────────────────────────────────────────
type Align = "left" | "center" | "right";

interface BuilderProps {
  isDarkMode: boolean;
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
  tokens: string[];
  branding: { siteName: string; siteUrl: string; siteLogoUrl: string; socialFacebook: string; socialTwitter: string; socialInstagram: string; socialYoutube: string };
}

const PALETTE: { type: BlockType; label: string; icon: React.ReactNode }[] = [
  { type: "heading", label: "Heading", icon: <Type className="w-3.5 h-3.5" /> },
  { type: "text", label: "Text", icon: <AlignLeft className="w-3.5 h-3.5" /> },
  { type: "button", label: "Button", icon: <MousePointerClick className="w-3.5 h-3.5" /> },
  { type: "image", label: "Image", icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { type: "table", label: "Details Table", icon: <TableIcon className="w-3.5 h-3.5" /> },
  { type: "divider", label: "Divider", icon: <Minus className="w-3.5 h-3.5" /> },
  { type: "spacer", label: "Spacer", icon: <MoveVertical className="w-3.5 h-3.5" /> },
];

const ALIGNS: { value: Align; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

export default function EmailTemplateBuilder({ isDarkMode, blocks, onChange, tokens, branding }: BuilderProps) {
  const [selectedId, setSelectedId] = useState<string | null>(blocks[0]?.id ?? null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [copied, setCopied] = useState("");

  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  const updateBlock = (id: string, patch: Partial<EmailBlock>) => {
    onChange(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b)));
  };
  const removeBlock = (id: string) => {
    const next = blocks.filter((b) => b.id !== id);
    onChange(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };
  const moveTo = (fromId: string, toIndex: number) => {
    const from = blocks.findIndex((b) => b.id === fromId);
    if (from === -1) return;
    const next = [...blocks];
    const [item] = next.splice(from, 1);
    // Dropping block A on block B means A takes B's slot: insert at the
    // target index in the post-removal array (no shift adjustment needed).
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, item);
    onChange(next);
  };
  const insertAt = (type: BlockType, toIndex: number) => {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, makeBlock(type));
    onChange(next);
    setSelectedId(next[Math.max(0, Math.min(toIndex, next.length - 1))].id);
  };

  const copyToken = (tok: string) => {
    navigator.clipboard?.writeText(tok).then(() => {
      setCopied(tok);
      setTimeout(() => setCopied(""), 1200);
    }).catch(() => {});
  };

  const input = `w-full py-2 px-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-brand/20 ${
    isDarkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-600" : "bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400"
  }`;
  const rail = `rounded-xl border ${isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"}`;

  // Render one block inside the canvas (light-theme email look, always readable).
  const renderBlock = (b: EmailBlock) => {
    switch (b.type) {
      case "heading":
        return <h2 style={{ margin: "0 0 14px", color: b.color, fontSize: 20, lineHeight: 1.3, textAlign: b.align }}>{b.text || "Heading"}</h2>;
      case "text":
        return <p style={{ margin: "0 0 16px", color: "#334155", fontSize: 14, lineHeight: 1.6, textAlign: b.align, whiteSpace: "pre-wrap" }}>{b.text}</p>;
      case "button":
        return (
          <div style={{ textAlign: b.align, margin: "0 0 16px" }}>
            <span style={{ display: "inline-block", padding: "12px 26px", borderRadius: 10, background: "#0d9488", color: "#fff", fontSize: 13, fontWeight: 700 }}>
              {b.label || "Button"}
            </span>
          </div>
        );
      case "image":
        return (
          <div style={{ textAlign: b.align, margin: "0 0 16px" }}>
            {b.src
              ? <img src={b.src} alt={b.alt} width={`${b.width}%`} style={{ maxWidth: "100%", height: "auto", borderRadius: 10 }} />
              : <div className="py-4 text-[10px] text-slate-400 italic border border-dashed border-slate-300 rounded-lg text-center">Image — set its URL in the panel</div>}
          </div>
        );
      case "divider":
        return <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "18px 0" }} />;
      case "spacer":
        return <div style={{ height: Math.max(4, Math.min(120, b.height)) }} />;
      case "table":
        return (
          <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", margin: "0 0 18px" }}>
            <tbody>
              {b.rows.map((r, i) => (
                <React.Fragment key={i}>
                  <tr><td style={{ background: "#f8fafc", padding: "10px 16px", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>{r.label || "Label"}</td></tr>
                  <tr><td style={{ padding: "12px 16px", color: "#334155", fontSize: 14 }}>{r.value || "Value"}</td></tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[170px_1fr] xl:grid-cols-[170px_1fr_250px] gap-4">
      {/* ── Palette ── */}
      <div className={`${rail} p-3 space-y-2 self-start`}>
        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Blocks</p>
        <p className="text-[10px] text-slate-400 leading-relaxed -mt-1">Drag a block into the email, then click it to edit.</p>
        {PALETTE.map((p) => (
          <div
            key={p.type}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/block-type", p.type); e.dataTransfer.effectAllowed = "copy"; }}
            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[10px] font-bold cursor-grab active:cursor-grabbing transition-all select-none ${
              isDarkMode ? "border-slate-800 bg-slate-900 text-slate-300 hover:border-teal-brand/50" : "border-slate-200 bg-white text-slate-600 hover:border-teal-brand/50"
            }`}
          >
            <span className="text-teal-brand">{p.icon}</span> {p.label}
          </div>
        ))}
      </div>

      {/* ── Canvas (email preview) ── */}
      <div className={`${rail} p-4`}>
        <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
          <span>Email preview — drag blocks to reorder · click to edit</span>
          <span className="normal-case font-semibold tracking-normal">{blocks.length} block{blocks.length === 1 ? "" : "s"}</span>
        </div>

        {/* Branded shell — mirrors the real 600px email layout: light-grey
            header (black logo pops), centered logo + site name below. */}
        <div className="max-w-[600px] mx-auto rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <div className="px-6 py-5 text-center" style={{ background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
            {(() => {
              // Custom logo from branding; otherwise the packaged logo on the
              // configured site URL, so the preview matches real emails.
              const base = (branding.siteUrl || "").trim().replace(/\/+$/, "");
              const logo = (branding.siteLogoUrl || (base ? `${base}/assets/images/dailyimpact.png` : "")).trim();
              return logo
                ? <img src={logo} alt="logo" className="h-10 w-auto object-contain mx-auto" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                : null;
            })()}
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-500">{branding.siteName}</p>
          </div>

          <div
            className="px-5 py-6 min-h-[160px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverId(null);
              const type = e.dataTransfer.getData("text/block-type") as BlockType;
              if (type) { insertAt(type, blocks.length); return; }
              const id = e.dataTransfer.getData("text/block-id");
              if (id) moveTo(id, blocks.length);
            }}
          >
            {blocks.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 italic border-2 border-dashed border-slate-200 rounded-xl">
                Drag blocks here to build your email…
              </div>
            ) : (
              <div className="space-y-1">
                {blocks.map((b, i) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/block-id", b.id); e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverId(b.id); }}
                    onDragLeave={() => setDragOverId((cur) => (cur === b.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      setDragOverId(null);
                      const type = e.dataTransfer.getData("text/block-type") as BlockType;
                      if (type) { insertAt(type, i); return; }
                      const id = e.dataTransfer.getData("text/block-id");
                      if (id && id !== b.id) moveTo(id, i);
                    }}
                    onClick={() => setSelectedId(b.id)}
                    className={`group relative rounded-xl border-2 transition-all cursor-pointer ${
                      selectedId === b.id
                        ? "border-teal-brand ring-2 ring-teal-brand/20"
                        : dragOverId === b.id
                          ? "border-teal-brand/60"
                          : "border-transparent hover:border-slate-200"
                    }`}
                  >
                    <div className="absolute -top-2.5 right-1 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-white pointer-events-none">{b.type}</span>
                      <button
                        type="button"
                        title="Delete block"
                        onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }}
                        className="p-1 rounded bg-rose-500 text-white hover:bg-rose-600"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                      <GripVertical className="w-4 h-4" />
                    </div>
                    <div className="pl-4">
                      {renderBlock(b)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-center gap-3 text-[10px] text-slate-400">
            <span className="uppercase font-bold tracking-wider">Follow</span>
            <span className="font-semibold">{branding.socialFacebook ? "f" : "·"}</span>
            <span className="font-semibold">{branding.socialTwitter ? "𝕏" : "·"}</span>
            <span className="font-semibold">{branding.socialInstagram ? "◉" : "·"}</span>
            <span className="font-semibold">{branding.socialYoutube ? "▶" : "·"}</span>
          </div>
        </div>
      </div>

      {/* ── Inspector ── */}
      <div className={`${rail} p-3 space-y-3 self-start`}>
        {!selected ? (
          <p className="text-[11px] text-slate-400 leading-relaxed">Click a block in the preview to edit its content, colours, links and details.</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Edit {selected.type}</p>
              <button type="button" onClick={() => removeBlock(selected.id)} className="text-[9px] font-bold text-rose-500 hover:underline">Delete</button>
            </div>

            {selected.type === "heading" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Heading text</label>
                  <textarea rows={2} value={selected.text} onChange={(e) => updateBlock(selected.id, { text: e.target.value })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Alignment</label>
                  <div className="flex gap-1">
                    {ALIGNS.map((a) => (
                      <button key={a.value} type="button" onClick={() => updateBlock(selected.id, { align: a.value } as Partial<EmailBlock>)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selected.align === a.value ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-white border border-slate-200 text-slate-500"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Colour</label>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : "#0f172a"}
                    onChange={(e) => updateBlock(selected.id, { color: e.target.value })} className="w-full h-9 rounded-lg cursor-pointer" />
                </div>
              </div>
            )}

            {selected.type === "text" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Text</label>
                  <textarea rows={5} value={selected.text} onChange={(e) => updateBlock(selected.id, { text: e.target.value })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Alignment</label>
                  <div className="flex gap-1">
                    {ALIGNS.map((a) => (
                      <button key={a.value} type="button" onClick={() => updateBlock(selected.id, { align: a.value } as Partial<EmailBlock>)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selected.align === a.value ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-white border border-slate-200 text-slate-500"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selected.type === "button" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Button label</label>
                  <input type="text" value={selected.label} onChange={(e) => updateBlock(selected.id, { label: e.target.value })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Link (URL or {"{{token}}"})</label>
                  <input type="text" value={selected.url} onChange={(e) => updateBlock(selected.id, { url: e.target.value })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Alignment</label>
                  <div className="flex gap-1">
                    {ALIGNS.map((a) => (
                      <button key={a.value} type="button" onClick={() => updateBlock(selected.id, { align: a.value } as Partial<EmailBlock>)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selected.align === a.value ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-white border border-slate-200 text-slate-500"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selected.type === "image" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Image URL</label>
                  <input type="text" value={selected.src} onChange={(e) => updateBlock(selected.id, { src: e.target.value })} placeholder="https://…" className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Alt text</label>
                  <input type="text" value={selected.alt} onChange={(e) => updateBlock(selected.id, { alt: e.target.value })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Width %</label>
                  <input type="number" min={10} max={100} value={selected.width} onChange={(e) => updateBlock(selected.id, { width: String(Math.max(10, Math.min(100, Number(e.target.value) || 100))) })} className={input} />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Alignment</label>
                  <div className="flex gap-1">
                    {ALIGNS.map((a) => (
                      <button key={a.value} type="button" onClick={() => updateBlock(selected.id, { align: a.value } as Partial<EmailBlock>)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selected.align === a.value ? "bg-teal-brand text-white" : isDarkMode ? "bg-slate-800 text-slate-400" : "bg-white border border-slate-200 text-slate-500"}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selected.type === "spacer" && (
              <div className="space-y-1">
                <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Spacer height (px)</label>
                <input type="range" min={4} max={120} value={selected.height}
                  onChange={(e) => updateBlock(selected.id, { height: Number(e.target.value) })} className="w-full accent-teal-brand" />
                <div className="text-center text-[10px] font-bold text-slate-400">{selected.height}px</div>
              </div>
            )}

            {selected.type === "table" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[9px] uppercase font-bold tracking-wider text-slate-400">Label / Value rows</label>
                  <button type="button" onClick={() => updateBlock(selected.id, { rows: [...selected.rows, { label: "New", value: "" }] } as Partial<EmailBlock>)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-teal-brand/10 text-teal-brand text-[9px] font-black uppercase tracking-wider hover:bg-teal-brand hover:text-white transition-all">
                    <Plus className="w-3 h-3" /> Add row
                  </button>
                </div>
                {selected.rows.map((r, i) => (
                  <div key={i} className="space-y-1 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                    <input type="text" placeholder="Label (e.g. Amount)" value={r.label}
                      onChange={(e) => updateBlock(selected.id, { rows: selected.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } as Partial<EmailBlock>)} className={input} />
                    <input type="text" placeholder="Value (e.g. {{donation_amount}})" value={r.value}
                      onChange={(e) => updateBlock(selected.id, { rows: selected.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) } as Partial<EmailBlock>)} className={input} />
                    <button type="button" onClick={() => updateBlock(selected.id, { rows: selected.rows.filter((_, j) => j !== i) } as Partial<EmailBlock>)}
                      className="text-[9px] font-bold text-rose-500 hover:underline">Remove row</button>
                  </div>
                ))}
              </div>
            )}

            {/* Token chips for the selected editable block */}
            {tokens.length > 0 && (selected.type === "text" || selected.type === "heading" || selected.type === "button" || selected.type === "table") && (
              <div className="space-y-1 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Insert dynamic value</span>
                <div className="flex flex-wrap gap-1">
                  {tokens.map((tok) => (
                    <button key={tok} type="button"
                      onClick={() => {
                        if (selected.type === "table") {
                          const rows =
                            selected.rows.length === 0
                              ? [{ label: "", value: tok }]
                              : selected.rows.map((r, i) => (i === selected.rows.length - 1 ? { ...r, value: r.value + tok } : r));
                          updateBlock(selected.id, { rows } as Partial<EmailBlock>);
                        } else {
                          const field = selected.type === "button" ? "label" : "text";
                          updateBlock(selected.id, { [field]: selected[field as "text" | "label"] + tok } as Partial<EmailBlock>);
                        }
                        copyToken(tok);
                      }}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border font-mono text-[10px] transition-all ${
                        copied === tok ? "border-teal-brand text-teal-brand" : isDarkMode ? "border-slate-700 text-slate-300 hover:border-teal-brand/50" : "border-slate-200 text-slate-500 hover:border-teal-brand/50"
                      }`}>
                      {copied === tok ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {tok}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
