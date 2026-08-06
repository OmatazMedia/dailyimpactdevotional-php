import React, { useState, useEffect } from "react";
import { Devotional } from "../types";
import { API_BASE } from "../config/api";
import { BookOpen, Sparkles, ChevronLeft, ChevronRight, Book, Quote, Share2, X, Link, Check, Mail, Send } from "lucide-react";
import TtsPlayerModal from "./TtsPlayerModal";
import { motion, AnimatePresence } from "motion/react";
import { buildHeaderMap, normalizeHeaderKey, HeaderMappingRow } from "../lib/headers";
import { slugForDevotional } from "../lib/devotionalSlug";

interface DevotionalViewProps {
  devotional: Devotional;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  prevDevotional?: Devotional;
  nextDevotional?: Devotional;
  isDarkMode: boolean;
  /** Preloaded mapped headers (dateKey -> url) so the correct image shows on first paint. */
  headerMap?: Record<string, string>;
}

export default function DevotionalView({
  devotional,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  prevDevotional,
  nextDevotional,
  isDarkMode,
  headerMap: preloadedHeaderMap,
}: DevotionalViewProps) {
  const [isTtsOpen, setIsTtsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [telegramChannelLink, setTelegramChannelLink] = useState("https://t.me/dailyimpactdevotional");

  // Mapped header images (dateKey -> filePath). When the parent preloads them
  // in parallel with the devotional list (App.tsx), we render them immediately
  // on first paint instead of waiting for a second fetch to /headers.php.
  // We still self-fetch as a fallback when the prop map is empty (e.g. the
  // parent's headers fetch failed) — an empty object is truthy, so the skip
  // guard must check its size, not just presence.
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (preloadedHeaderMap && Object.keys(preloadedHeaderMap).length > 0) {
      setHeaderMap(preloadedHeaderMap);
      return;
    }
    fetch(`${API_BASE}/headers.php`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: HeaderMappingRow[] | null) => {
        if (!Array.isArray(data)) return;
        setHeaderMap(buildHeaderMap(data));
      })
      .catch(() => {});
  }, [preloadedHeaderMap]);

  // Reaction emojis
  const EMOJIS = ["🙏", "❤️", "🙌", "🔥", "👏"];
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [userReacted, setUserReacted] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!devotional?.id) return;
    // Real reactions only — counts start empty (0) and grow as visitors click.
    // No fake seeded numbers: previously a hash of the id generated phony
    // counts which made it look like readers had already reacted.
    setReactionCounts({});
    setUserReacted({});
    // Load the REAL persisted reaction counts for this devotional so returning
    // visitors see the true totals (stored server-side by reactions.php).
    fetch(`${API_BASE}/reactions.php?devotionalId=${encodeURIComponent(devotional.id)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { success?: boolean; counts?: Record<string, number> } | null) => {
        if (data?.counts) setReactionCounts(data.counts);
      })
      .catch(() => {});
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data?.telegram_channel_link) setTelegramChannelLink(data.telegram_channel_link);
      })
      .catch(() => {});
  }, [devotional?.id]);

  const handleReact = (emoji: string) => {
    const isCurrentlyReacted = !!userReacted[emoji];
    const newCounts = { ...reactionCounts };
    const newUserReacted = { ...userReacted };

    if (isCurrentlyReacted) {
      newCounts[emoji] = Math.max(0, (newCounts[emoji] || 1) - 1);
      newUserReacted[emoji] = false;
    } else {
      newCounts[emoji] = (newCounts[emoji] || 0) + 1;
      newUserReacted[emoji] = true;
    }

    setReactionCounts(newCounts);
    setUserReacted(newUserReacted);

    // Persist the vote to the backend (one vote per devotional + emoji + IP;
    // the server ignores duplicates). On response we adopt the server's real
    // counts so the UI can never drift from the persisted state.
    fetch(`${API_BASE}/reactions.php`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        devotionalId: devotional.id,
        emoji,
        action: isCurrentlyReacted ? "unreact" : "react",
      }),
    })
      .then(r => (r.ok ? r.json() : null))
      .then((data: { success?: boolean; counts?: Record<string, number> } | null) => {
        if (data?.counts) setReactionCounts(data.counts);
      })
      .catch(() => {});
  };

  // Share URL uses the devotional's date as a human-friendly slug
  // (5-aug-2025) instead of the random UUID — falls back to the id for
  // legacy rows whose date can't be parsed.
  const shareSlug = slugForDevotional(devotional.date, devotional.year) || devotional.id;
  const shareUrl = `${window.location.origin}?devotional=${shareSlug}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Robust month and day extraction for custom image mapping
  let activeImageUrl = devotional.imageUrl;
  // If the devotional has no image of its own, fall back to the mapped header
  // image for its date (uploaded via the Dashboard's header mapping flow).
  if (!activeImageUrl && devotional.date) {
    const key = normalizeHeaderKey(devotional.date);
    if (key && headerMap[key]) {
      activeImageUrl = headerMap[key];
    }
  }
  if (devotional.date) {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let month = "";
    let dayInt = "";
    
    const clean = devotional.date.trim();
    // Match "Month Day" or "Month Day, Year"
    const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/i);
    if (matchMD) {
      month = matchMD[1];
      dayInt = parseInt(matchMD[2], 10).toString();
    } else {
      // Match "Day Month" or "Day Month Year"
      const matchDM = clean.match(/^(\d+)\s+([A-Za-z]+)/i);
      if (matchDM) {
        dayInt = parseInt(matchDM[1], 10).toString();
        month = matchDM[2];
      }
    }
    
    // Fallback if regex doesn't match clean formats (e.g. scanning strings)
    if (!month) {
      for (const m of months) {
        if (clean.toLowerCase().includes(m.toLowerCase())) {
          month = m;
          break;
        }
      }
      const numMatch = clean.match(/\d+/);
      if (numMatch) {
        dayInt = parseInt(numMatch[0], 10).toString();
      }
    }

    if (month && dayInt) {
      // Normalize month capitalization to match storage (e.g., "June")
      const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1).toLowerCase();
      const dayNumVal = parseInt(dayInt, 10);
      const dayPadded = dayNumVal < 10 ? `0${dayNumVal}` : dayInt;
      
      void monthCapitalized;
      void dayPadded;
    }
  }

  // Future devotional locking logic:
  // Convert devotional date to comparison value
  const getDevotionalDateValue = (dateStr: string, year: number): Date => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let monthIdx = -1;
    let dayNum = 1;
    const clean = dateStr.trim();
    const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/i);
    if (matchMD) {
      monthIdx = months.findIndex(m => m.toLowerCase() === matchMD[1].toLowerCase());
      dayNum = parseInt(matchMD[2], 10);
    } else {
      const matchDM = clean.match(/^(\d+)\s+([A-Za-z]+)/i);
      if (matchDM) {
        dayNum = parseInt(matchDM[1], 10);
        monthIdx = months.findIndex(m => m.toLowerCase() === matchDM[2].toLowerCase());
      }
    }
    if (monthIdx === -1) {
      for (let i = 0; i < months.length; i++) {
        if (clean.toLowerCase().includes(months[i].toLowerCase())) {
          monthIdx = i;
          break;
        }
      }
      const numMatch = clean.match(/\d+/);
      if (numMatch) dayNum = parseInt(numMatch[0], 10);
    }
    if (monthIdx === -1) monthIdx = 5; // Default June
    return new Date(year, monthIdx, dayNum, 0, 0, 0, 0);
  };

  // Helper to get date parts in a specific Timezone (Lagos West Africa Time)
  const getLagosTimezoneDate = () => {
    try {
      const d = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Africa/Lagos',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const parts = formatter.formatToParts(d);
      const partMap = Object.fromEntries(parts.map(p => [p.type, p.value]));
      return {
        year: parseInt(partMap.year, 10),
        month: partMap.month,
        day: parseInt(partMap.day, 10),
      };
    } catch (e) {
      const d = new Date();
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return {
        year: d.getFullYear(),
        month: months[d.getMonth()],
        day: d.getDate(),
      };
    }
  };

  const getLagosTimeString = () => {
    try {
      return new Date().toLocaleTimeString('en-US', {
        timeZone: 'Africa/Lagos',
        timeStyle: 'short',
      }) + " (WAT)";
    } catch (e) {
      return "West Africa Time";
    }
  };

  const getLagosDateString = () => {
    try {
      return new Date().toLocaleDateString('en-US', {
        timeZone: 'Africa/Lagos',
        dateStyle: 'medium',
      });
    } catch (e) {
      return "";
    }
  };

  const { year: lagosYear, month: lagosMonthName, day: lagosDay } = getLagosTimezoneDate();
  const monthsList = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const lagosMonthIdx = monthsList.findIndex(m => m.toLowerCase() === lagosMonthName.toLowerCase());
  
  // Construct a Date object representing 12:00:00 AM of today in Lagos
  const lagosTodayMidnight = new Date(lagosYear, lagosMonthIdx !== -1 ? lagosMonthIdx : 5, lagosDay, 0, 0, 0, 0);

  const devotionalDate = getDevotionalDateValue(devotional.date, devotional.year);
  const isLocked = devotionalDate > lagosTodayMidnight;

  if (isLocked) {
    return (
      <article
        id="devotional-content-wrapper"
        className={`rounded-3xl p-6 md:p-10 transition-colors duration-300 border relative ${
          isDarkMode
            ? "bg-slate-900/60 border-slate-800 text-slate-100"
            : "bg-white border-slate-100 text-slate-900"
        }`}
      >
        {/* Date & Title Block */}
        <header className="text-center mb-8">
          <p className="text-slate-600 dark:text-slate-400 font-sans font-extrabold text-xs md:text-sm uppercase tracking-widest mb-4">
            {devotional.date}, {devotional.year}
          </p>

          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl mx-auto text-slate-900 dark:text-white break-words text-balance">
            {devotional.title}
          </h2>
          
          <div className="w-16 h-[2px] bg-slate-900 dark:bg-white mx-auto mt-4 mb-8 rounded-full" />
        </header>

        {/* Locked Notice Block */}
        <div className={`p-8 md:p-12 rounded-2xl border text-center my-8 flex flex-col items-center justify-center space-y-4 transition-all ${
          isDarkMode
            ? "bg-slate-950/40 border-slate-800 text-slate-200"
            : "bg-slate-50 border-slate-200 text-slate-900"
        }`}>
          <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-inner mb-2 animate-pulse">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
          </div>

          <h3 className="font-serif text-lg md:text-xl font-bold tracking-tight">
            This Devotional is Preparing to Shine
          </h3>
          
          <p className="text-xs md:text-sm leading-relaxed max-w-md text-slate-500 dark:text-slate-400">
            Please come back tomorrow to unlock today's word. Devotionals are released daily at midnight (12:00 AM) in Lagos, West Africa Time (WAT).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md w-full">
            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 text-[10px] font-mono font-bold tracking-wider text-slate-500 dark:text-slate-400">
              <span>🕒 Your local time:</span>
              <span>
                {new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })} @ {new Date().toLocaleTimeString(undefined, { timeStyle: 'short' })}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-slate-400">
                ({Intl.DateTimeFormat().resolvedOptions().timeZone})
              </span>
            </div>

            <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-teal-brand/5 dark:bg-teal-brand/10 border border-teal-brand/20 text-[10px] font-mono font-bold tracking-wider text-teal-brand dark:text-teal-400">
              <span>🌍 Lagos Time (WAT):</span>
              <span>
                {getLagosDateString()} @ {getLagosTimeString()}
              </span>
              <span className="text-[9px] uppercase tracking-widest text-teal-brand/70 dark:text-teal-400/70">
                Africa/Lagos (GMT+1)
              </span>
            </div>
          </div>
        </div>

        {/* Footer Nav enabling going back to previous readings */}
        <footer id="devotional-footer-nav" className="mt-12 border-t border-slate-100 dark:border-slate-800/80 pt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Previous Devotional Tile */}
            {hasPrev && prevDevotional ? (
              <button
                onClick={onPrev}
                className={`p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-4 group ${
                  isDarkMode
                    ? "bg-slate-900/40 hover:bg-slate-900 border-slate-800 text-slate-100"
                    : "bg-white hover:bg-slate-100 border-slate-200 text-slate-950 font-semibold"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-950 dark:text-slate-300 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-all shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-400 block mb-0.5">
                    Previous Devotional
                  </span>
                  <h5 className="font-serif text-sm font-bold truncate">
                    {prevDevotional.title}
                  </h5>
                </div>
              </button>
            ) : (
              <div
                className={`p-5 rounded-2xl border border-dashed text-left opacity-40 select-none flex items-center gap-4 ${
                  isDarkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"
                }`}
              >
                <div className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center shrink-0">
                  <ChevronLeft className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider block">First Devotional</span>
                  <h5 className="font-serif text-sm font-bold">No previous reading</h5>
                </div>
              </div>
            )}

            {/* Next Devotional Tile (Shown as locked/disabled) */}
            <div
              className={`p-5 rounded-2xl border border-dashed text-right opacity-40 select-none flex flex-row-reverse items-center justify-between gap-4 ${
                isDarkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"
              }`}
            >
              <div className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center shrink-0">
                <ChevronRight className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block">Future Reading Locked</span>
                <h5 className="font-serif text-sm font-bold">Unlocks at midnight</h5>
              </div>
            </div>
          </div>
        </footer>
      </article>
    );
  }

  return (
    <article
      id="devotional-content-wrapper"
      className={`rounded-3xl p-6 md:p-10 transition-colors duration-300 border relative ${
        isDarkMode
          ? "bg-slate-900/60 border-slate-800 text-slate-100"
          : "bg-white border-slate-100 text-slate-900"
      }`}
    >
      {/* Date & Title & Image Block */}
      <header className="text-center mb-8">
        <p className="text-slate-600 dark:text-slate-400 font-sans font-extrabold text-xs md:text-sm uppercase tracking-widest mb-4">
          {devotional.date}, {devotional.year}
        </p>          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl mx-auto text-slate-900 dark:text-white break-words text-balance">
            {devotional.title}
          </h2>
        
        <div className="w-16 h-[2px] bg-slate-900 dark:bg-white mx-auto mt-4 mb-8 rounded-full" />
      </header>

      {/* Floating Audio Broadcast Button - Repositioned to lower-left, small, slow hotspot animation, monochrome */}
      <div className="fixed left-6 bottom-6 md:left-8 md:bottom-8 z-[60] group">
        <button
          onClick={() => setIsTtsOpen(true)}
          className="w-11 h-11 rounded-full bg-white dark:bg-slate-900 text-teal-brand dark:text-white border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 flex items-center justify-center transition-all shadow-[0_8px_30px_rgba(0,0,0,0.15)] relative"
          title="Open Audio Broadcast Player"
        >
          {/* Pulsating circles with slow animation */}
          <span className="absolute inset-0 rounded-full bg-teal-brand dark:bg-white animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite] opacity-15" />
          <span className="absolute -inset-1.5 rounded-full border border-teal-brand/10 dark:border-white/10 animate-[pulse_4s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
          
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
            />
          </svg>
        </button>
        
        {/* Hover label */}
        <span className="absolute left-14 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap border border-slate-800">
          Audio Broadcast
        </span>
      </div>

      {/* Audio Broadcast Translucent Modal Overlay */}
      <TtsPlayerModal
        devotional={devotional}
        isOpen={isTtsOpen}
        onClose={() => setIsTtsOpen(false)}
        isDarkMode={isDarkMode}
      />

      {/* Specified Devotional Banner Image — displayed at its NATIVE size
          (e.g. a 1920×300 upload): the image fills the full content width and
          its height follows the image's own aspect ratio, so NOTHING is
          cropped. On smaller screens it scales down responsively, end to end,
          instead of being cover-cropped into a fixed banner box. */}
      <div className="w-full mb-8 rounded-2xl md:rounded-3xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800/80 group bg-slate-100 dark:bg-slate-950/60">
        <img
          src={activeImageUrl || "/assets/images/devotional-title-jan.jpg"}
          alt="Daily Impact Devotional Title Banner"
          className="block w-full h-auto transition-transform duration-700 ease-out group-hover:scale-[1.015]"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Styled Scripture Section with Icons - Monochrome, Justified */}
      <section
        id="devotional-scripture"
        className={`relative p-6 md:p-8 rounded-2xl mb-8 leading-relaxed font-sans text-center transition-all border ${
          isDarkMode
            ? "bg-slate-900/40 text-slate-200 border-slate-800"
            : "bg-slate-50 text-slate-950 border-slate-200"
        }`}
      >
        <div className="flex justify-center mb-4 text-slate-400 dark:text-slate-500">
          <Quote className="w-6 h-6 rotate-180" />
        </div>
        
        <p className="text-sm md:text-base font-medium italic leading-loose mb-4 text-justify text-slate-800 dark:text-slate-200">
          {devotional.scriptureText}
        </p>
        
        {/* Scripture reference with Icon */}
        <div className="flex items-center justify-end gap-1.5 text-slate-700 dark:text-slate-300">
          <Book className="w-3.5 h-3.5 opacity-80" />
          <span className="text-xs md:text-sm font-bold tracking-wide uppercase">
            {devotional.scriptureRef}
          </span>
        </div>
      </section>

      {/* Devotional Body Text with Editorial Drop Cap and Justified alignment */}
      <section id="devotional-body" className="space-y-6 text-sm md:text-base leading-relaxed tracking-normal">
        {devotional.paragraphs.map((p, idx) => {
          if (idx === 0) {
            return (
              <p
                key={idx}
                className={`first-letter:text-5xl first-letter:font-serif first-letter:font-extrabold first-letter:mr-3 first-letter:float-left first-letter:text-black dark:first-letter:text-white first-letter:leading-none text-justify ${
                  isDarkMode
                    ? "text-slate-300 font-normal hover:text-slate-200 transition-colors"
                    : "text-slate-950 font-normal hover:text-black transition-colors"
                }`}
                dangerouslySetInnerHTML={{ __html: p }}
              />
            );
          }
          return (
            <p
              key={idx}
              className={`text-justify ${
                isDarkMode
                  ? "text-slate-300 font-normal hover:text-slate-200 transition-colors"
                  : "text-slate-950 font-normal hover:text-black transition-colors"
              }`}
              dangerouslySetInnerHTML={{ __html: p }}
            />
          );
        })}
      </section>

      {/* Additional Scripture Reference Badge with Icon - Monochrome */}
      <section id="additional-scripture" className="mt-8 mb-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <span
            className={`px-4 py-2 text-xs font-extrabold uppercase tracking-widest rounded-xl transition-all select-none flex items-center gap-1.5 ${
              isDarkMode
                ? "bg-slate-900/80 text-slate-300 border border-slate-800"
                : "bg-slate-100 text-slate-700 border border-slate-300"
            }`}
          >
            <Book className="w-3.5 h-3.5" />
            Additional Scripture:
          </span>
          <span className="font-mono text-sm font-bold text-slate-800 dark:text-white">
            {devotional.additionalScripture}
          </span>
        </div>
      </section>

      {/* Prayer & Confession of Faith Section with Icons - Monochrome, Justified */}
      <section
        id="prayer-confession-card"
        className={`p-6 md:p-8 rounded-2xl mb-6 border flex gap-4 items-start transition-all ${
          isDarkMode
            ? "bg-slate-900/40 border-slate-800 text-slate-200"
            : "bg-slate-50 border-slate-100 text-slate-900"
        }`}
      >
        <div className="p-3 bg-black dark:bg-white text-white dark:text-black rounded-xl shrink-0 shadow-md">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="space-y-2">
          <h4 className="font-serif text-base font-bold text-slate-900 dark:text-white">
            Prayer & Confession of Faith
          </h4>
          <p className="text-xs md:text-sm italic leading-relaxed font-medium text-justify text-slate-700 dark:text-slate-300">
            {devotional.prayerConfession}
          </p>
        </div>
      </section>

      {/* One Year Bible Reading Section with Icons - Monochrome, Justified */}
      <section
        id="bible-reading-card"
        className={`p-6 md:p-8 rounded-2xl mb-12 border flex gap-4 items-start transition-all ${
          isDarkMode
            ? "bg-slate-900/40 border-slate-800 text-slate-200"
            : "bg-slate-50 border-slate-100 text-slate-900"
        }`}
      >
        <div className="p-3 bg-black dark:bg-white text-white dark:text-black rounded-xl shrink-0 shadow-md">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="space-y-2">
          <h4 className="font-serif text-base font-bold text-slate-900 dark:text-white">
            One Year Bible Reading
          </h4>
          <p className="text-sm font-mono font-bold text-slate-800 dark:text-white">
            {devotional.bibleReading}
          </p>
        </div>
      </section>

      {/* Reactions & Share Section */}
      <section
        id="reactions-share-section"
        className={`p-6 rounded-2xl mb-8 border flex flex-col md:flex-row items-center justify-between gap-6 transition-all ${
          isDarkMode
            ? "bg-slate-900/30 border-slate-800"
            : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        {/* Left Side: Reaction Emojis */}
        <div className="space-y-2 w-full md:w-auto">
          <h4 className="text-xs font-serif font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            How do you react to today's Word?
          </h4>
          <div className="flex flex-wrap gap-2.5">
            {EMOJIS.map((emoji) => {
              const count = reactionCounts[emoji] || 0;
              const hasReacted = userReacted[emoji];
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReact(emoji)}
                  className={`px-3.5 py-2 rounded-xl border text-sm font-bold flex items-center gap-2 transition-all hover:scale-[1.05] active:scale-[0.95] ${
                    hasReacted
                      ? isDarkMode
                        ? "bg-teal-brand/20 border-teal-brand text-teal-brand ring-1 ring-teal-brand/30 font-black"
                        : "bg-teal-brand/10 border-teal-brand text-teal-brand font-black"
                      : isDarkMode
                        ? "bg-slate-950/40 border-slate-850 text-slate-300 hover:bg-slate-950"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="text-lg leading-none">{emoji}</span>
                  <span className="text-xs font-mono font-black">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Share + Telegram */}
        <div className="w-full md:w-auto flex items-center justify-end gap-2">
          {/* Telegram Channel Button */}
          <a
            href={telegramChannelLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 py-3 px-4 bg-sky-500 hover:bg-sky-600 text-white rounded-xl text-xs font-serif font-black uppercase tracking-widest active:scale-[0.98] transition-all shadow-md"
            title="Join our Telegram Channel"
          >
            <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
              <path d="M11.944 0C5.344 0 0 5.344 0 11.944c0 6.6 5.344 11.944 11.944 11.944 6.6 0 11.944-5.344 11.944-11.944C23.888 5.344 18.544 0 11.944 0zm5.534 8.204l-1.854 8.736c-.14.62-.51.773-1.03.48l-2.824-2.083-1.362 1.312c-.15.15-.278.278-.57.278l.202-2.872 5.228-4.723c.227-.202-.05-.314-.352-.112L8.41 14.12l-2.784-.87c-.605-.19-.62-.605.126-.897l10.87-4.19c.504-.19.945.11.756.914z" />
            </svg>
            <span className="hidden sm:inline">Telegram</span>
          </a>

          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 bg-teal-brand hover:opacity-90 text-white rounded-xl text-xs font-serif font-black uppercase tracking-widest active:scale-[0.98] transition-all shadow-md"
          >
            <Share2 className="w-4 h-4" />
            Share Devotional
          </button>
        </div>
      </section>

      {/* SHARE MODAL DIALOG */}
      <AnimatePresence>
        {isShareOpen && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsShareOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className={`relative w-full max-w-lg rounded-2xl overflow-hidden border shadow-2xl flex flex-col max-h-[90vh] ${
                isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-950"
              }`}
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
                <h3 className="font-serif text-base font-black uppercase tracking-tight flex items-center gap-2">
                  <Share2 className="w-4.5 h-4.5 text-teal-brand" />
                  Share Devotional
                </h3>
                <button
                  type="button"
                  onClick={() => setIsShareOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="p-6 overflow-y-auto space-y-6">
                
                {/* 1. Preview Card (The sharing image and title and snippet preview) */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Sharing Card Preview
                  </span>
                  
                  <div className={`border rounded-xl overflow-hidden shadow-sm ${
                    isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                  }`}>
                    {/* Header Image */}
                    <div className="w-full aspect-[21/9] overflow-hidden border-b border-slate-200 dark:border-slate-800 relative bg-slate-100 dark:bg-slate-950 flex items-center justify-center">
                      <img
                        src={activeImageUrl || "/assets/images/devotional-title-jan.jpg"}
                        alt={devotional.title}
                        className="w-full h-full object-cover object-center"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    {/* Devotional content preview */}
                    <div className="p-4 space-y-2 text-left">
                      <span className="text-[9px] font-mono font-black text-teal-brand uppercase tracking-wider">
                        {devotional.date}, {devotional.year}
                      </span>
                      <h4 className="font-serif text-sm font-black text-black dark:text-white leading-tight break-words">
                        {devotional.title}
                      </h4>
                      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 line-clamp-2">
                        {devotional.paragraphs && devotional.paragraphs[0]}
                      </p>
                      <div className="pt-2 border-t border-slate-200/50 dark:border-slate-850/50 flex justify-between items-center text-[9px] font-mono font-bold text-slate-400">
                        <span>by {devotional.author}</span>
                        <span>dailyimpactdevotional.org</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Social Channels Sharing Grid */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Select Sharing Destination
                  </span>

                  <div className="grid grid-cols-2 gap-3">
                    {/* WhatsApp */}
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`"${devotional.title}"\n\n${devotional.paragraphs && devotional.paragraphs[0] ? devotional.paragraphs[0].slice(0, 150) : ""}...\n\nRead more at: ${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold transition-all"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.724-1.457L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.825 1.451 5.436 0 9.86-4.42 9.864-9.858.002-2.634-1.019-5.109-2.877-6.97C16.592 1.966 14.122 1.96 12.01 1.96c-5.44 0-9.866 4.418-9.87 9.856-.002 1.802.491 3.56 1.425 5.12l-.993 3.626 3.73-.978zm11.387-5.464c-.307-.154-1.817-.897-2.097-1.002-.28-.103-.483-.154-.686.154-.203.308-.783.992-.961 1.2-.177.207-.355.23-.662.077-1.043-.521-1.745-.929-2.435-2.112-.183-.314-.183-.51.017-.714.179-.181.307-.359.461-.54.153-.18.203-.307.307-.513.102-.206.051-.385-.026-.54-.076-.153-.686-1.654-.94-2.264-.247-.594-.501-.513-.686-.522-.178-.008-.381-.01-.584-.01-.203 0-.533.076-.813.384-.28.307-1.066 1.042-1.066 2.54 0 1.498 1.09 2.946 1.242 3.15.152.203 2.148 3.28 5.203 4.6.726.313 1.294.5 1.737.643.73.23 1.393.197 1.919.12.585-.087 1.817-.743 2.071-1.46.254-.718.254-1.332.178-1.46-.076-.129-.28-.206-.587-.36z" />
                      </svg>
                      WhatsApp
                    </a>

                    {/* Facebook */}
                    <a
                      href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${shareUrl}`)}&quote=${encodeURIComponent(`"${devotional.title}"\n\n${devotional.paragraphs && devotional.paragraphs[0] ? devotional.paragraphs[0].slice(0, 150) : ""}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-bold transition-all"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Facebook
                    </a>

                    {/* Twitter/X */}
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`"${devotional.title}"\n\n${devotional.paragraphs && devotional.paragraphs[0] ? devotional.paragraphs[0].slice(0, 120) : ""}...\n\n`)}&url=${encodeURIComponent(`${shareUrl}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-500/20 bg-slate-500/5 hover:bg-slate-500/10 hover:border-slate-500/30 text-slate-800 dark:text-slate-200 text-xs font-bold transition-all"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      Twitter / X
                    </a>

                    {/* Telegram */}
                    <a
                      href={`https://t.me/share/url?url=${encodeURIComponent(`${shareUrl}`)}&text=${encodeURIComponent(`"${devotional.title}"\n\n${devotional.paragraphs && devotional.paragraphs[0] ? devotional.paragraphs[0].slice(0, 120) : ""}...`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 hover:border-sky-500/30 text-sky-600 dark:text-sky-400 text-xs font-bold transition-all"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.944 0C5.344 0 0 5.344 0 11.944c0 6.6 5.344 11.944 11.944 11.944 6.6 0 11.944-5.344 11.944-11.944C23.888 5.344 18.544 0 11.944 0zm5.534 8.204l-1.854 8.736c-.14.62-.51.773-1.03.48l-2.824-2.083-1.362 1.312c-.15.15-.278.278-.57.278l.202-2.872 5.228-4.723c.227-.202-.05-.314-.352-.112L8.41 14.12l-2.784-.87c-.605-.19-.62-.605.126-.897l10.87-4.19c.504-.19.945.11.756.914z" />
                      </svg>
                      Telegram
                    </a>
                  </div>
                </div>

                {/* 3. Utility Actions */}
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex gap-2">
                    {/* Copy Link */}
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-teal-brand/20 bg-teal-brand/5 hover:bg-teal-brand hover:text-white text-teal-brand text-xs font-serif font-black uppercase tracking-widest transition-all"
                    >
                      {copied ? (
                        <>
                          <Check className="w-4 h-4" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Link className="w-4 h-4" />
                          Copy Link
                        </>
                      )}
                    </button>

                    {/* Email Share */}
                    <a
                      href={`mailto:?subject=${encodeURIComponent(devotional.title)}&body=${encodeURIComponent(`"${devotional.title}"\n\n${devotional.paragraphs && devotional.paragraphs[0] ? devotional.paragraphs[0].slice(0, 200) : ""}...\n\nRead full devotional at: ${shareUrl}`)}`}
                      className="flex items-center justify-center gap-2 py-3 px-5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-serif font-black uppercase tracking-widest transition-all text-slate-700 dark:text-slate-300"
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </a>
                  </div>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Nav footer bar - Redesigned to show previous & next devotionals directly as rich navigation tiles */}
      <footer id="devotional-footer-nav" className="mt-12 border-t border-slate-100 dark:border-slate-800/80 pt-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Previous Devotional Tile */}
          {hasPrev && prevDevotional ? (
            <button
              onClick={onPrev}
              className={`p-5 rounded-2xl border text-left transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-4 group ${
                isDarkMode
                  ? "bg-slate-900/40 hover:bg-slate-900 border-slate-800 text-slate-100"
                  : "bg-white hover:bg-slate-100 border-slate-200 text-slate-950 font-semibold"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-950 dark:text-slate-300 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-all shrink-0">
                <ChevronLeft className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-400 block mb-0.5">
                  Previous Devotional
                </span>
                <h5 className="font-serif text-sm font-bold truncate">
                  {prevDevotional.title}
                </h5>
              </div>
            </button>
          ) : (
            <div
              className={`p-5 rounded-2xl border border-dashed text-left opacity-40 select-none flex items-center gap-4 ${
                isDarkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"
              }`}
            >
              <div className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center shrink-0">
                <ChevronLeft className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block">First Devotional</span>
                <h5 className="font-serif text-sm font-bold">No previous reading</h5>
              </div>
            </div>
          )}

          {/* Next Devotional Tile */}
          {hasNext && nextDevotional ? (
            <button
              onClick={onNext}
              className={`p-5 rounded-2xl border text-right transition-all hover:scale-[1.01] active:scale-[0.99] flex flex-row-reverse items-center justify-between gap-4 group ${
                isDarkMode
                  ? "bg-slate-900/40 hover:bg-slate-900 border-slate-800 text-slate-100"
                  : "bg-white hover:bg-slate-100 border-slate-200 text-slate-950 font-semibold"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-950 dark:text-slate-300 group-hover:bg-black group-hover:text-white dark:group-hover:bg-white dark:group-hover:text-black transition-all shrink-0">
                <ChevronRight className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-400 block mb-0.5">
                  Next Devotional
                </span>
                <h5 className="font-serif text-sm font-bold truncate">
                  {nextDevotional.title}
                </h5>
              </div>
            </button>
          ) : (
            <div
              className={`p-5 rounded-2xl border border-dashed text-right opacity-40 select-none flex flex-row-reverse items-center justify-between gap-4 ${
                isDarkMode ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400"
              }`}
            >
              <div className="w-10 h-10 rounded-full border border-dashed flex items-center justify-center shrink-0">
                <ChevronRight className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider block">Last Devotional</span>
                <h5 className="font-serif text-sm font-bold">No subsequent reading</h5>
              </div>
            </div>
          )}
        </div>
      </footer>
    </article>
  );
}
