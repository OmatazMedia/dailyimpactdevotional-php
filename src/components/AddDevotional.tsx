import React, { useState, useRef, useEffect } from "react";
import { Devotional } from "../types";
import { API_BASE } from "../config/api";
import { 
  Calendar, 
  Book, 
  Check, 
  HelpCircle, 
  Save, 
  Bold, 
  Italic, 
  Underline, 
  Strikethrough, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify, 
  RotateCcw, 
  RotateCw, 
  Scissors, 
  Copy, 
  Clipboard, 
  Eraser, 
  Type, 
  FileText, 
  Power, 
  Sparkles,
  ExternalLink,
  Eye,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Quote
} from "lucide-react";

interface AddDevotionalProps {
  onSave: (devotional: Omit<Devotional, "id">) => void;
  isDarkMode: boolean;
}

const OT_BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi"
];

const NT_BOOKS = [
  "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
  "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
  "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
  "1 John", "2 John", "3 John", "Jude", "Revelation"
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function AddDevotional({ onSave, isDarkMode }: AddDevotionalProps) {
  const [adminTimezone, setAdminTimezone] = useState("Africa/Lagos");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data?.admin_timezone) setAdminTimezone(data.admin_timezone);
      })
      .catch(() => {});
  }, []);

  // Navigation tabs for Form vs Preview
  const [activeSubTab, setActiveSubTab] = useState<"edit" | "preview">("edit");

  // Title field
  const [title, setTitle] = useState("");

  // Devotion Date Fields — blank by default, user picks from calendar
  const [day, setDay] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [year, setYear] = useState<string>(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date());
    } catch { return String(new Date().getFullYear()); }
  });

  // Custom Calendar Popover state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calMonthIdx, setCalMonthIdx] = useState(() => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'numeric' }).format(new Date()), 10) - 1;
    } catch { return new Date().getMonth(); }
  });
  const [calYear, setCalYear] = useState(() => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10);
    } catch { return new Date().getFullYear(); }
  });
  useEffect(() => {
    try {
      setYear(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()));
      setCalMonthIdx(parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'numeric' }).format(new Date()), 10) - 1);
      setCalYear(parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10));
    } catch {}
  }, [adminTimezone]);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Close calendar click-outside handler
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Scripture Reading Fields
  const [scriptureTestament, setScriptureTestament] = useState<string>("");
  const [scriptureBook, setScriptureBook] = useState<string>("");
  const [scriptureCV, setScriptureCV] = useState<string>("");
  const [scriptureText, setScriptureText] = useState("");

  // Devotional Content
  const [rawParagraphs, setRawParagraphs] = useState("");

  // Rich Text Editor State History for Undo/Redo
  const [editorHistory, setEditorHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const updateRawParagraphsWithHistory = (newValue: string) => {
    const newHistory = editorHistory.slice(0, historyIndex + 1);
    newHistory.push(newValue);
    setEditorHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setRawParagraphs(newValue);
  };

  const applyFormatting = (tagOpen: string, tagClose: string) => {
    const textarea = document.getElementById("devotional-content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    if (start === undefined || end === undefined) return;

    const selectedText = text.substring(start, end);
    const replacement = `${tagOpen}${selectedText}${tagClose}`;
    const newValue = text.substring(0, start) + replacement + text.substring(end);
    
    updateRawParagraphsWithHistory(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tagOpen.length, start + tagOpen.length + selectedText.length);
    }, 10);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setRawParagraphs(editorHistory[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < editorHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setRawParagraphs(editorHistory[nextIndex]);
    }
  };

  const handleClearFormatting = () => {
    const textarea = document.getElementById("devotional-content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    if (start === undefined || end === undefined || start === end) return;

    const selectedText = text.substring(start, end);
    const cleanedText = selectedText.replace(/<\/?[^>]+(>|$)/g, "");
    const newValue = text.substring(0, start) + cleanedText + text.substring(end);
    
    updateRawParagraphsWithHistory(newValue);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start, start + cleanedText.length);
    }, 10);
  };

  const handleFontSize = (size: "larger" | "smaller") => {
    const openTag = size === "larger" ? '<span style="font-size: 1.25rem; font-weight: bold;">' : '<span style="font-size: 0.85rem;">';
    applyFormatting(openTag, '</span>');
  };

  const handleCut = () => {
    const textarea = document.getElementById("devotional-content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    if (start !== undefined && end !== undefined && start !== end) {
      const selected = text.substring(start, end);
      navigator.clipboard.writeText(selected);
      const newValue = text.substring(0, start) + text.substring(end);
      updateRawParagraphsWithHistory(newValue);
    }
  };

  const handleCopy = () => {
    const textarea = document.getElementById("devotional-content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    if (start !== undefined && end !== undefined && start !== end) {
      const selected = text.substring(start, end);
      navigator.clipboard.writeText(selected);
    }
  };

  const handlePaste = async () => {
    const textarea = document.getElementById("devotional-content-textarea") as HTMLTextAreaElement;
    if (!textarea) return;
    try {
      const pasted = await navigator.clipboard.readText();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      if (start !== undefined && end !== undefined) {
        const newValue = text.substring(0, start) + pasted + text.substring(end);
        updateRawParagraphsWithHistory(newValue);
      }
    } catch (e) {
      // Fallback
    }
  };

  // Additional Reference 1 Fields
  const [ref1Testament, setRef1Testament] = useState<string>("");
  const [ref1Book, setRef1Book] = useState<string>("");
  const [ref1CV, setRef1CV] = useState<string>("");

  // Additional Reference 2 Fields
  const [ref2Testament, setRef2Testament] = useState<string>("");
  const [ref2Book, setRef2Book] = useState<string>("");
  const [ref2CV, setRef2CV] = useState<string>("");

  // Show third reference state
  const [showThirdRef, setShowThirdRef] = useState<boolean>(false);
  
  // Additional Reference 3 Fields
  const [ref3Testament, setRef3Testament] = useState<string>("");
  const [ref3Book, setRef3Book] = useState<string>("");
  const [ref3CV, setRef3CV] = useState<string>("");

  // Prayer & Confession
  const [prayerConfession, setPrayerConfession] = useState("");

  // Daily Bible Readings
  const [dbr1Testament, setDbr1Testament] = useState<string>("");
  const [dbr1Text, setDbr1Text] = useState<string>("");

  const [dbr2Testament, setDbr2Testament] = useState<string>("");
  const [dbr2Text, setDbr2Text] = useState<string>("");

  // Author field
  const [author, setAuthor] = useState("Dr. Andy Osakwe");

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Helper to dynamically get books for a testament
  const getBooksForTestament = (testament: string) => {
    if (testament === "Old Testament") return OT_BOOKS;
    if (testament === "New Testament") return NT_BOOKS;
    return [];
  };

  // Synchronize internal calendar views when day/month/year states change
  useEffect(() => {
    if (year) {
      const parsedYear = parseInt(year, 10);
      if (!isNaN(parsedYear)) setCalYear(parsedYear);
    }
    if (month) {
      const idx = MONTHS.indexOf(month);
      if (idx !== -1) setCalMonthIdx(idx);
    }
  }, [day, month, year]);

  // Calendar Day Click Handler
  const handleCalendarDaySelect = (selectedDay: number) => {
    setDay(selectedDay.toString());
    setMonth(MONTHS[calMonthIdx]);
    setYear(calYear.toString());
    setIsCalendarOpen(false);
  };

  // Calendar render helper calculations
  const getDaysInMonth = (mIdx: number, yr: number) => {
    return new Date(yr, mIdx + 1, 0).getDate();
  };

  const getFirstDayIndex = (mIdx: number, yr: number) => {
    return new Date(yr, mIdx, 1).getDay();
  };

  const handlePrevCalMonth = () => {
    if (calMonthIdx === 0) {
      setCalMonthIdx(11);
      setCalYear(prev => prev - 1);
    } else {
      setCalMonthIdx(prev => prev - 1);
    }
  };

  const handleNextCalMonth = () => {
    if (calMonthIdx === 11) {
      setCalMonthIdx(0);
      setCalYear(prev => prev + 1);
    } else {
      setCalMonthIdx(prev => prev + 1);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!day || !month || !year) errs.date = "A complete Devotion Date is required";
    if (!scriptureBook || !scriptureCV.trim()) errs.scriptureRef = "Scripture Book and Chapter/Verse are required";
    if (!scriptureText.trim()) errs.scriptureText = "Scripture text passage is required";
    if (!rawParagraphs.trim()) errs.paragraphs = "Devotional content is required";
    if (!prayerConfession.trim()) errs.prayerConfession = "Prayer & Confession is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const getPreviewDevotionalData = (): Devotional => {
    const paragraphs = rawParagraphs
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const finalDate = `${month} ${day}`;
    const finalScriptureRef = `${scriptureBook} ${scriptureCV}`;

    const additionalRefsList = [];
    if (ref1Book && ref1CV.trim()) {
      additionalRefsList.push(`${ref1Book} ${ref1CV.trim()}`);
    }
    if (ref2Book && ref2CV.trim()) {
      additionalRefsList.push(`${ref2Book} ${ref2CV.trim()}`);
    }
    if (showThirdRef && ref3Book && ref3CV.trim()) {
      additionalRefsList.push(`${ref3Book} ${ref3CV.trim()}`);
    }
    const finalAdditionalScripture = additionalRefsList.join(", ") || "None";

    const dbrList = [];
    if (dbr1Text.trim()) dbrList.push(dbr1Text.trim());
    if (dbr2Text.trim()) dbrList.push(dbr2Text.trim());
    const finalBibleReading = dbrList.join(", ") || "None";

    return {
      id: "preview-temp-id",
      date: finalDate,
      year: Number(year) || 2026,
      title: title || "Untitled Devotional",
      scriptureRef: finalScriptureRef,
      scriptureText: scriptureText || "No scripture text provided.",
      paragraphs: paragraphs.length > 0 ? paragraphs : ["No devotional content written yet."],
      additionalScripture: finalAdditionalScripture,
      prayerConfession: prayerConfession || "No prayer or confession provided.",
      bibleReading: finalBibleReading,
      author: author || "Dr. Andy Osakwe"
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 320, behavior: "smooth" });
      return;
    }

    const previewData = getPreviewDevotionalData();
    onSave({
      date: previewData.date,
      year: previewData.year,
      title: previewData.title,
      scriptureRef: previewData.scriptureRef,
      scriptureText: previewData.scriptureText,
      paragraphs: previewData.paragraphs,
      additionalScripture: previewData.additionalScripture,
      prayerConfession: previewData.prayerConfession,
      bibleReading: previewData.bibleReading,
      author: previewData.author,
    });
  };

  // Process word counting
  const wordCount = rawParagraphs
    ? rawParagraphs.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // Build calendar days array
  const totalDays = getDaysInMonth(calMonthIdx, calYear);
  const firstDayIndex = getFirstDayIndex(calMonthIdx, calYear);
  const calGridCells = [];
  
  // Fill empty leading days
  for (let i = 0; i < firstDayIndex; i++) {
    calGridCells.push(null);
  }
  // Fill actual days
  for (let d = 1; d <= totalDays; d++) {
    calGridCells.push(d);
  }

  const previewDevotional = getPreviewDevotionalData();

  return (
    <div id="add-devotional-tab-view" className="space-y-6">
      
      {/* Sub-tabs header layout to allow instant Live Preview previewing */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1.5 md:gap-4">
          <button
            type="button"
            onClick={() => setActiveSubTab("edit")}
            className={`py-2 px-3 md:px-5 font-serif text-sm md:text-base font-black uppercase tracking-wide border-b-2 transition-all ${
              activeSubTab === "edit"
                ? "border-black text-black dark:border-white dark:text-white"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
          >
            Form Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("preview")}
            className={`py-2 px-3 md:px-5 font-serif text-sm md:text-base font-black uppercase tracking-wide border-b-2 transition-all flex items-center gap-2 ${
              activeSubTab === "preview"
                ? "border-black text-black dark:border-white dark:text-white"
                : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            }`}
          >
            <Eye className="w-4 h-4" />
            Live Preview
          </button>
        </div>
        
        <div className="text-[10px] md:text-xs font-mono font-bold text-slate-400 dark:text-slate-500 hidden sm:block">
          Status: Editing Draft Devotional
        </div>
      </div>

      {/* RENDER FORM EDITOR SUBTAB */}
      {activeSubTab === "edit" && (
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Main Form Container */}
          <div className="space-y-6">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
              <h1 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight">
                Add Devotional
              </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 text-xs sm:text-sm font-semibold">
              
              {/* Title Field */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  * Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`w-full max-w-lg py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                  } ${errors.title ? "border-red-500 ring-1 ring-red-500" : ""}`}
                />
                {errors.title && <p className="text-red-600 text-[10px] font-bold">{errors.title}</p>}
              </div>

              {/* Devotional Date selection with Custom Calendar Dropdown Popover */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  * Devotion Date
                </label>
                
                <div className="flex flex-wrap items-center gap-2 relative">
                  
                  {/* Day Select */}
                  <select
                    value={day}
                    onChange={(e) => setDay(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[100px] ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">Day</option>
                    {Array.from({ length: 31 }, (_, i) => (i + 1).toString()).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>

                  {/* Month Select */}
                  <select
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[140px] ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">Select Month</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  {/* Year Select */}
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[120px] ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">Select Year</option>
                    {Array.from({ length: 26 }, (_, i) => (2035 - i).toString()).map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>

                  {/* CUSTOM CALENDAR POPUP TRIGGER BUTTON */}
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(!isCalendarOpen)}
                    className={`p-2 border rounded transition-colors ${
                      isDarkMode 
                        ? "bg-slate-900 border-slate-700 hover:bg-slate-800 text-white" 
                        : "bg-white border-slate-300 hover:bg-slate-100 text-black"
                    }`}
                    title="Open Interactive Calendar View"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>

                  {/* INTERACTIVE CALENDAR POPUP MODAL/CARD */}
                  {isCalendarOpen && (
                    <div 
                      ref={calendarRef}
                      className={`absolute left-0 sm:left-auto sm:right-0 md:left-0 top-12 z-50 p-4 rounded-xl border shadow-2xl w-72 transition-all animate-in fade-in slide-in-from-top-1 ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                      }`}
                    >
                      {/* Calendar Navigation Header */}
                      <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-900 pb-2">
                        <button
                          type="button"
                          onClick={handlePrevCalMonth}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4 text-slate-950 dark:text-white" />
                        </button>
                        
                        <div className="text-center font-serif text-sm font-black uppercase text-slate-950 dark:text-white">
                          {MONTHS[calMonthIdx]} {calYear}
                        </div>

                        <button
                          type="button"
                          onClick={handleNextCalMonth}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4 text-slate-950 dark:text-white" />
                        </button>
                      </div>

                      {/* Weekday headers */}
                      <div className="grid grid-cols-7 gap-1 text-center font-mono text-[10px] font-bold text-slate-400 mb-1">
                        {WEEKDAYS.map((w) => (
                          <div key={w}>{w}</div>
                        ))}
                      </div>

                      {/* Day Cells Grid */}
                      <div className="grid grid-cols-7 gap-1">
                        {calGridCells.map((dVal, idx) => {
                          if (dVal === null) {
                            return <div key={`empty-${idx}`} />;
                          }
                          const isCurrentlySelected = 
                            day === dVal.toString() && 
                            month === MONTHS[calMonthIdx] && 
                            year === calYear.toString();

                          return (
                            <button
                              type="button"
                              key={`day-${dVal}`}
                              onClick={() => handleCalendarDaySelect(dVal)}
                              className={`aspect-square w-full rounded flex items-center justify-center font-mono text-xs font-bold transition-all ${
                                isCurrentlySelected
                                  ? "bg-black text-white dark:bg-white dark:text-black font-black scale-105"
                                  : isDarkMode
                                    ? "hover:bg-slate-800 text-slate-200"
                                    : "hover:bg-slate-100 text-slate-950"
                              }`}
                            >
                              {dVal}
                            </button>
                          );
                        })}
                      </div>

                      {/* Year Selector Dropdown inside Calendar popup */}
                      <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-900 flex justify-between items-center">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Quick Year:</span>
                        <select
                          value={calYear}
                          onChange={(e) => setCalYear(parseInt(e.target.value, 10))}
                          className={`py-0.5 px-1.5 text-xs font-bold border rounded focus:outline-none ${
                            isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                          }`}
                        >
                          {Array.from({ length: 26 }, (_, i) => (2035 - i)).map((yr) => (
                            <option key={`cal-yr-${yr}`} value={yr}>{yr}</option>
                          ))}
                        </select>
                      </div>

                    </div>
                  )}

                </div>
                {errors.date && <p className="text-red-600 text-[10px] font-bold">{errors.date}</p>}
              </div>

              {/* Scripture Reading with testament and dynamic books */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Scripture Reading
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
                  {/* Testament Select */}
                  <select
                    value={scriptureTestament}
                    onChange={(e) => {
                      setScriptureTestament(e.target.value);
                      setScriptureBook(""); // Reset book selection
                    }}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    <option value="Old Testament">Old Testament</option>
                    <option value="New Testament">New Testament</option>
                  </select>

                  {/* Dynamic Book Select */}
                  <select
                    value={scriptureBook}
                    onChange={(e) => setScriptureBook(e.target.value)}
                    disabled={!scriptureTestament}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white disabled:opacity-50 ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    {getBooksForTestament(scriptureTestament).map((bk) => (
                      <option key={bk} value={bk}>{bk}</option>
                    ))}
                  </select>

                  {/* Chapter/Verse Text input */}
                  <input
                    type="text"
                    placeholder="Chapter / Verse (e.g. 1:1-8)"
                    value={scriptureCV}
                    onChange={(e) => setScriptureCV(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    } ${errors.scriptureRef ? "border-red-500" : ""}`}
                  />
                </div>
                {errors.scriptureRef && <p className="text-red-600 text-[10px] font-bold">{errors.scriptureRef}</p>}
              </div>

              {/* Scripture Passage */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Scripture Passage
                </label>
                <textarea
                  rows={3}
                  value={scriptureText}
                  onChange={(e) => setScriptureText(e.target.value)}
                  className={`w-full max-w-2xl py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                  } ${errors.scriptureText ? "border-red-500 ring-1 ring-red-500" : ""}`}
                />
                {errors.scriptureText && <p className="text-red-600 text-[10px] font-bold">{errors.scriptureText}</p>}
              </div>

              {/* Devotional Content with Functional Custom Editor */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  * Devotional Content
                </label>
                
                {/* Fully Responsive Custom Editor Container */}
                <div className="max-w-3xl border border-slate-300 dark:border-slate-700 rounded-xl shadow-sm bg-[#F5F5F5] dark:bg-slate-900 overflow-hidden text-black dark:text-white transition-all">
                  
                  {/* Rich text editing functional toolbar */}
                  <div className="p-2 bg-[#EFEFEF] dark:bg-slate-800/80 border-b border-slate-300 dark:border-slate-700 flex flex-wrap gap-1 items-center">
                    
                    {/* Styling tools */}
                    <div className="flex items-center border-r border-slate-300 dark:border-slate-700 pr-1.5 mr-1 gap-0.5">
                      <button
                        type="button"
                        onClick={() => applyFormatting("<b>", "</b>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Bold (<b>)"
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting("<i>", "</i>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Italic (<i>)"
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting("<u>", "</u>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Underline (<u>)"
                      >
                        <Underline className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting("<s>", "</s>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Strike (<s>)"
                      >
                        <Strikethrough className="w-3.5 h-3.5" />
                      </button>
                    </div>
 
                    {/* Alignment tools */}
                    <div className="flex items-center border-r border-slate-300 dark:border-slate-700 pr-1.5 mr-1 gap-0.5">
                      <button
                        type="button"
                        onClick={() => applyFormatting('<div style="text-align: left;">', "</div>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Align Left"
                      >
                        <AlignLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting('<div style="text-align: center;">', "</div>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Align Center"
                      >
                        <AlignCenter className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting('<div style="text-align: right;">', "</div>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Align Right"
                      >
                        <AlignRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting('<div style="text-align: justify;">', "</div>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Align Justify"
                      >
                        <AlignJustify className="w-3.5 h-3.5" />
                      </button>
                    </div>
 
                    {/* Undo Redo Clipboard tools */}
                    <div className="flex items-center border-r border-slate-300 dark:border-slate-700 pr-1.5 mr-1 gap-0.5">
                      <button
                        type="button"
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className={`p-1 rounded transition-colors ${
                          historyIndex === 0
                            ? "opacity-40 cursor-not-allowed text-slate-400"
                            : "hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                        }`}
                        title="Undo"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRedo}
                        disabled={historyIndex >= editorHistory.length - 1}
                        className={`p-1 rounded transition-colors ${
                          historyIndex >= editorHistory.length - 1
                            ? "opacity-40 cursor-not-allowed text-slate-400"
                            : "hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                        }`}
                        title="Redo"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCut}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Cut Selection"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Copy Selection"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={handlePaste}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Paste"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                      </button>
                    </div>
 
                    {/* Helpers */}
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={handleClearFormatting}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Clear Formatting (Remove Tags)"
                      >
                        <Eraser className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => applyFormatting("<blockquote>", "</blockquote>")}
                        className="p-1 hover:bg-slate-300 dark:hover:bg-slate-700 rounded transition-colors text-slate-800 dark:text-slate-200"
                        title="Blockquote (<blockquote>)"
                      >
                        <Quote className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFontSize("larger")}
                        className="px-1.5 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-[10px] font-black font-mono transition-colors text-slate-800 dark:text-slate-200"
                        title="Make Larger"
                      >
                        A+
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFontSize("smaller")}
                        className="px-1.5 py-0.5 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-[10px] font-black font-mono transition-colors text-slate-800 dark:text-slate-200"
                        title="Make Smaller"
                      >
                        A-
                      </button>
                    </div>
                  </div>
 
                  {/* Actual Form Textarea */}
                  <textarea
                    id="devotional-content-textarea"
                    rows={12}
                    value={rawParagraphs}
                    onChange={(e) => updateRawParagraphsWithHistory(e.target.value)}
                    placeholder="Paste or write the core daily devotional text paragraphs here..."
                    className={`w-full p-4 text-xs font-medium font-sans focus:outline-none leading-relaxed border-none transition-all ${
                      isDarkMode ? "bg-[#1E293B] text-white" : "bg-white text-black"
                    } ${errors.paragraphs ? "border-red-500 ring-2 ring-red-500/20" : ""}`}
                  />
 
                  {/* Clean, Non-JCE Footer */}
                  <div className="px-3 py-1.5 bg-[#EFEFEF] dark:bg-slate-800/90 border-t border-slate-300 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400 flex items-center justify-between select-none">
                    <div className="italic text-[9px]">
                      Highlight text to apply tags instantly. HTML tags will render perfectly in previews.
                    </div>
                    <div className="flex items-center gap-4">
                      <span>Paragraphs: <span className="font-bold text-slate-800 dark:text-slate-200">{rawParagraphs.split(/\n\s*\n/).filter(Boolean).length}</span></span>
                      <span>Words: <span className="font-bold text-slate-800 dark:text-slate-200">{wordCount}</span></span>
                    </div>
                  </div>
                </div>
                {errors.paragraphs && <p className="text-red-600 text-[10px] font-bold">{errors.paragraphs}</p>}
              </div>

              {/* Additional Reference 1 */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Additional Reference 1
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
                  {/* Testament Select */}
                  <select
                    value={ref1Testament}
                    onChange={(e) => {
                      setRef1Testament(e.target.value);
                      setRef1Book("");
                    }}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    <option value="Old Testament">Old Testament</option>
                    <option value="New Testament">New Testament</option>
                  </select>

                  {/* Dynamic Book Select */}
                  <select
                    value={ref1Book}
                    onChange={(e) => setRef1Book(e.target.value)}
                    disabled={!ref1Testament}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white disabled:opacity-50 ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    {getBooksForTestament(ref1Testament).map((bk) => (
                      <option key={bk} value={bk}>{bk}</option>
                    ))}
                  </select>

                  {/* Chapter/Verse input */}
                  <input
                    type="text"
                    placeholder="Chapter / Verse"
                    value={ref1CV}
                    onChange={(e) => setRef1CV(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  />
                </div>
              </div>

              {/* Additional Reference 2 */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Additional Reference 2
                </label>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
                  {/* Testament Select */}
                  <select
                    value={ref2Testament}
                    onChange={(e) => {
                      setRef2Testament(e.target.value);
                      setRef2Book("");
                    }}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    <option value="Old Testament">Old Testament</option>
                    <option value="New Testament">New Testament</option>
                  </select>

                  {/* Dynamic Book Select */}
                  <select
                    value={ref2Book}
                    onChange={(e) => setRef2Book(e.target.value)}
                    disabled={!ref2Testament}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white disabled:opacity-50 ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    {getBooksForTestament(ref2Testament).map((bk) => (
                      <option key={bk} value={bk}>{bk}</option>
                    ))}
                  </select>

                  {/* Chapter/Verse input */}
                  <input
                    type="text"
                    placeholder="Chapter / Verse"
                    value={ref2CV}
                    onChange={(e) => setRef2CV(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  />
                </div>
              </div>

              {/* Show third Reference Checkbox */}
              <div className="flex items-center gap-2 max-w-lg select-none">
                <input
                  type="checkbox"
                  id="showThirdRef"
                  checked={showThirdRef}
                  onChange={(e) => setShowThirdRef(e.target.checked)}
                  className="w-4 h-4 rounded text-black border-slate-300 focus:ring-black accent-black cursor-pointer"
                />
                <label htmlFor="showThirdRef" className="text-slate-950 dark:text-slate-100 font-black cursor-pointer">
                  Show third Reference
                </label>
              </div>

              {/* Additional Reference 3 (Conditional) */}
              {showThirdRef && (
                <div className="space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-slate-950 dark:text-slate-100 font-black">
                    Additional Reference 3
                  </label>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
                    {/* Testament Select */}
                    <select
                      value={ref3Testament}
                      onChange={(e) => {
                        setRef3Testament(e.target.value);
                        setRef3Book("");
                      }}
                      className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                      }`}
                    >
                      <option value="">- Select -</option>
                      <option value="Old Testament">Old Testament</option>
                      <option value="New Testament">New Testament</option>
                    </select>

                    {/* Dynamic Book Select */}
                    <select
                      value={ref3Book}
                      onChange={(e) => setRef3Book(e.target.value)}
                      disabled={!ref3Testament}
                      className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white disabled:opacity-50 ${
                        isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                      }`}
                    >
                      <option value="">- Select -</option>
                      {getBooksForTestament(ref3Testament).map((bk) => (
                        <option key={bk} value={bk}>{bk}</option>
                      ))}
                    </select>

                    {/* Chapter/Verse input */}
                    <input
                      type="text"
                      placeholder="Chapter / Verse"
                      value={ref3CV}
                      onChange={(e) => setRef3CV(e.target.value)}
                      className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                      }`}
                  />
                  </div>
                </div>
              )}

              {/* Prayer & Confession of Faith */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Prayer & Confession of Faith
                </label>
                <textarea
                  rows={3}
                  value={prayerConfession}
                  onChange={(e) => setPrayerConfession(e.target.value)}
                  className={`w-full max-w-2xl py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                  } ${errors.prayerConfession ? "border-red-500 ring-1 ring-red-500" : ""}`}
                />
                {errors.prayerConfession && <p className="text-red-600 text-[10px] font-bold">{errors.prayerConfession}</p>}
              </div>

              {/* Daily Bible Reading 1 */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Daily Bible Reading 1
                </label>
                
                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  {/* Testament Select */}
                  <select
                    value={dbr1Testament}
                    onChange={(e) => setDbr1Testament(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[160px] ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    <option value="Old Testament">Old Testament</option>
                    <option value="New Testament">New Testament</option>
                  </select>

                  {/* Text Input for reading */}
                  <input
                    type="text"
                    placeholder="e.g. Genesis 1-3"
                    value={dbr1Text}
                    onChange={(e) => setDbr1Text(e.target.value)}
                    className={`w-full py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  />
                </div>
              </div>

              {/* Daily Bible Reading 2 */}
              <div className="space-y-1">
                <label className="block text-slate-950 dark:text-slate-100 font-black">
                  Daily Bible Reading 2
                </label>
                
                <div className="flex flex-col sm:flex-row gap-2 max-w-xl">
                  {/* Testament Select */}
                  <select
                    value={dbr2Testament}
                    onChange={(e) => setDbr2Testament(e.target.value)}
                    className={`py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[160px] ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  >
                    <option value="">- Select -</option>
                    <option value="Old Testament">Old Testament</option>
                    <option value="New Testament">New Testament</option>
                  </select>

                  {/* Text Input for reading */}
                  <input
                    type="text"
                    placeholder="e.g. Matthew 1"
                    value={dbr2Text}
                    onChange={(e) => setDbr2Text(e.target.value)}
                    className={`w-full py-1.5 px-3 border rounded focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-300 text-black font-semibold"
                    }`}
                  />
                </div>
              </div>

              {/* Author Field */}
              <div className="space-y-1 pt-2">
                <label className="block text-slate-500 dark:text-slate-400 font-bold text-[10px] uppercase">
                  Author
                </label>
                <input
                  type="text"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className={`py-1 px-2.5 text-[11px] border rounded focus:outline-none focus:border-black dark:focus:border-white min-w-[200px] ${
                    isDarkMode ? "bg-slate-900 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-700 dark:text-slate-300"
                  }`}
                />
              </div>

              {/* Submit Button */}
              <div className="pt-4 flex gap-4">
                <button
                  type="submit"
                  className="py-1.5 px-6 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase"
                >
                  submit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("preview")}
                  className="py-1.5 px-4 bg-slate-800 hover:bg-slate-900 border border-slate-700 text-white font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Live Preview
                </button>
              </div>

            </form>
          </div>

        </div>
      )}

      {/* RENDER LIVE PREVIEW SUBTAB (Rendered exactly like DevotionalView) */}
      {activeSubTab === "preview" && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <span>You are viewing a real-time layout preview of how this devotional will appear to readers.</span>
            <button
              type="button"
              onClick={() => setActiveSubTab("edit")}
              className="px-3 py-1 bg-black text-white dark:bg-white dark:text-black rounded font-black uppercase tracking-wider text-[10px]"
            >
              Back to Editor
            </button>
          </div>

          <article
            id="devotional-content-wrapper-preview"
            className={`rounded-3xl p-6 md:p-10 transition-all border relative ${
              isDarkMode
                ? "bg-slate-900/60 border-slate-800 text-slate-100"
                : "bg-white border-slate-100 text-slate-900"
            }`}
          >
            {/* Header Block */}
            <header className="text-center mb-8">
              <p className="text-slate-950 dark:text-slate-400 font-sans font-extrabold text-xs md:text-sm uppercase tracking-widest mb-4">
                {previewDevotional.date}, {previewDevotional.year}
              </p>

              <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight max-w-3xl mx-auto text-black dark:text-white break-words text-balance">
                {previewDevotional.title}
              </h2>
              
              <div className="w-16 h-[2px] bg-black dark:bg-white mx-auto mt-4 mb-8 rounded-full" />
            </header>

            {/* Daily Impact Banner image */}
            <div className="w-full mb-8 rounded-2xl md:rounded-3xl overflow-hidden shadow-lg border border-slate-200 dark:border-slate-800/80 group">
              <img
                src="/assets/images/devotional-title-jan.jpg"
                alt="Daily Impact Devotional Title Banner"
                className="w-full h-auto max-h-[460px] object-cover transition-transform duration-700 ease-out group-hover:scale-[1.015]"
                referrerPolicy="no-referrer"
              />
            </div>

            {/* Scripture Passage Section with Icon */}
            <section
              id="devotional-scripture-preview"
              className={`relative p-6 md:p-8 rounded-2xl mb-8 leading-relaxed font-sans text-center transition-all border ${
                isDarkMode
                  ? "bg-slate-900/40 text-slate-200 border-slate-800"
                  : "bg-slate-50 text-slate-950 border-slate-200"
              }`}
            >
              <div className="flex justify-center mb-4 text-slate-400 dark:text-slate-500">
                <Quote className="w-6 h-6 rotate-180" />
              </div>
              
              <p className="text-sm md:text-base font-medium italic leading-loose mb-4 text-justify text-slate-900 dark:text-slate-200">
                {previewDevotional.scriptureText}
              </p>
              
              <div className="flex items-center justify-end gap-1.5 text-slate-950 dark:text-slate-300">
                <Book className="w-3.5 h-3.5 opacity-80" />
                <span className="text-xs md:text-sm font-bold tracking-wide uppercase">
                  {previewDevotional.scriptureRef}
                </span>
              </div>
            </section>

             {/* Devotional Content paragraphs with Drop Cap on first item */}
            <section id="devotional-body-preview" className="space-y-6 text-sm md:text-base leading-relaxed tracking-normal">
              {previewDevotional.paragraphs.map((p, idx) => {
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

            {/* Additional Scripture section */}
            <section id="additional-scripture-preview" className="mt-8 mb-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span
                  className={`px-4 py-2 text-xs font-extrabold uppercase tracking-widest rounded-xl transition-all select-none flex items-center gap-1.5 ${
                    isDarkMode
                      ? "bg-slate-900/80 text-slate-300 border border-slate-800"
                      : "bg-slate-100 text-slate-950 border border-slate-300"
                  }`}
                >
                  <Book className="w-3.5 h-3.5" />
                  Additional Scripture:
                </span>
                <span className="font-mono text-sm font-bold text-slate-950 dark:text-white">
                  {previewDevotional.additionalScripture}
                </span>
              </div>
            </section>

            {/* Prayer & Confession Section */}
            <section
              id="prayer-confession-card-preview"
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
                <h4 className="font-serif text-base font-bold text-slate-950 dark:text-white">
                  Prayer & Confession of Faith
                </h4>
                <p className="text-xs md:text-sm italic leading-relaxed font-medium text-justify text-slate-800 dark:text-slate-300">
                  {previewDevotional.prayerConfession}
                </p>
              </div>
            </section>

            {/* One Year Bible Reading Plan Section */}
            <section
              id="bible-reading-card-preview"
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
                <h4 className="font-serif text-base font-bold text-slate-950 dark:text-white">
                  One Year Bible Reading
                </h4>
                <p className="text-sm font-mono font-bold text-slate-950 dark:text-white">
                  {previewDevotional.bibleReading}
                </p>
              </div>
            </section>

          </article>

          {/* Quick Submit Block from Preview Mode */}
          <div className="flex justify-end gap-3 p-4 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950">
            <button
              type="button"
              onClick={() => setActiveSubTab("edit")}
              className="py-2 px-5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-black tracking-wide rounded text-xs uppercase"
            >
              Edit Draft
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="py-2 px-6 bg-black text-white dark:bg-white dark:text-black hover:opacity-90 font-black tracking-wide rounded text-xs uppercase"
            >
              Publish Devotional
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
