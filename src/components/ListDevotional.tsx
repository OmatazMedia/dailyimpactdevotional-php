import React, { useState, useRef, useEffect } from "react";
import { Devotional } from "../types";
import { API_BASE } from "../config/api";
import { deleteDevotionalAsync } from "../devotionalsData";
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
  Quote,
  Edit3,
  List,
  Search,
  Filter,
  CheckCircle2,
  ArrowLeft,
  Trash2,
  AlertTriangle,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ListDevotionalProps {
  devotionals: Devotional[];
  onUpdate: (devotional: Devotional) => void;
  onDelete?: (ids: string[]) => void;
  /** Called when one or more DELETE requests failed — so the parent can show a
   *  REAL error toast instead of a false "deleted" success. */
  onDeleteError?: (err: unknown) => void;
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

// Sortable numeric value for a devotional's date (used to find the latest one)
const getDevotionalSortTime = (dev: Devotional): number => {
  const clean = (dev.date || "").trim();
  let mIdx = -1;
  let day = 1;
  const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/i);
  if (matchMD) {
    mIdx = MONTHS.findIndex(m => m.toLowerCase() === matchMD[1].toLowerCase());
    day = parseInt(matchMD[2], 10) || 1;
  }
  if (mIdx === -1) mIdx = 0;
  return (dev.year || 0) * 10000 + mIdx * 100 + day;
};

// Latest devotional's month/year — used as the admin filter default so newly
// imported devotionals are visible immediately instead of being hidden behind
// the "current month" filter (e.g. August 2026 hiding July data).
const getLatestDevotionalMonthYear = (list: Devotional[]): { month: string; year: string } | null => {
  if (!list || list.length === 0) return null;
  let latest = list[0];
  for (const dev of list) {
    if (getDevotionalSortTime(dev) > getDevotionalSortTime(latest)) latest = dev;
  }
  const parts = (latest.date || "").trim().split(/\s+/);
  if (parts.length < 2) return null;
  const monthMatch = MONTHS.find(m => m.toLowerCase() === parts[0].toLowerCase());
  if (!monthMatch) return null;
  return { month: monthMatch, year: String(latest.year ?? 0) };
};

export default function ListDevotional({ devotionals, onUpdate, onDelete, onDeleteError, isDarkMode }: ListDevotionalProps) {
  const [adminTimezone, setAdminTimezone] = useState("Africa/Lagos");

  // Real reaction counts per devotional (devotionalId -> emoji -> count), loaded
  // from the reactions API so the admin table reflects genuine visitor activity
  // instead of a static "No reactions yet" placeholder.
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data?.admin_timezone) setAdminTimezone(data.admin_timezone);
      })
      .catch(() => {});
  }, []);

  // Load the real reaction totals for every devotional. Re-fetches whenever the
  // devotional list changes (e.g. after an import) so counts stay fresh.
  useEffect(() => {
    if (devotionals.length === 0) {
      setReactionCounts({});
      return;
    }
    fetch(`${API_BASE}/reactions.php?all=1`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: Record<string, Record<string, number>> | null) => {
        if (data && typeof data === "object") setReactionCounts(data);
      })
      .catch(() => {});
  }, [devotionals]);

  // Navigation: "list" view or "edit" view
  const [currentMode, setCurrentMode] = useState<"list" | "edit">("list");
  const [selectedDevotional, setSelectedDevotional] = useState<Devotional | null>(null);

  // Admin List Filter States — default to the MOST RECENT devotional's
  // month/year (falling back to current Lagos time) so that previously
  // imported devotionals are visible immediately instead of being hidden by a
  // "current month" filter.
  const [filterMonth, setFilterMonth] = useState<string>(() => {
    const latest = getLatestDevotionalMonthYear(devotionals);
    if (latest) return latest.month;
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [filterYear, setFilterYear] = useState<string>(() => {
    const latest = getLatestDevotionalMonthYear(devotionals);
    if (latest) return latest.year;
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date());
    } catch { return String(new Date().getFullYear()); }
  });
  const [listSearchQuery, setListSearchQuery] = useState("");
  // Tracks whether the admin manually changed the filter, so the auto-adjust
  // effect below never overrides a deliberate selection.
  const filterTouchedRef = useRef(false);

  // ── Multi-select & Delete ────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; ids: string[] }>({ open: false, ids: [] });
  const [deleteCountdown, setDeleteCountdown] = useState(8);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const openDeleteModal = (ids: string[]) => {
    setDeleteModal({ open: true, ids });
    setDeleteCountdown(8);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setDeleteCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current!);
          // Countdown hit zero — abort the delete
          setDeleteModal({ open: false, ids: [] });
          return 8;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const abortDelete = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setDeleteModal({ open: false, ids: [] });
    setDeleteCountdown(8);
  };

  const confirmDelete = async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const ids = deleteModal.ids;
    setDeleteModal({ open: false, ids: [] });
    setDeleteCountdown(8);
    setSelectedIds(new Set());

    // Delete via API — await so the parent's list refresh happens AFTER the
    // deletes actually land (otherwise the re-fetch can race and show stale
    // rows). Errors are NOT swallowed: if any DELETE fails, the parent is told
    // so it can show a real error toast instead of a fake "deleted" success.
    try {
      await Promise.all(ids.map(id => deleteDevotionalAsync(id)));
    } catch (err) {
      console.error('Failed to delete devotional(s):', err);
      if (onDeleteError) onDeleteError(err);
      return;
    }

    // Notify parent (refreshes the list + toasts)
    if (onDelete) onDelete(ids);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    if (ids.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  };

  // Edit Mode Specific State (matching AddDevotional.tsx state)
  const [activeSubTab, setActiveSubTab] = useState<"edit" | "preview">("edit");
  const [title, setTitle] = useState("");
  const [day, setDay] = useState("1");
  const [month, setMonth] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [year, setYear] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date());
    } catch { return String(new Date().getFullYear()); }
  });
  
  // Custom Calendar state inside Editor
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
  const calendarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const month = new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date());
      const yearNum = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10);
      // NOTE: intentionally NOT resetting filterMonth/filterYear here — that
      // hid devotionals from other months behind a "current month" filter.
      // The filter keeps its initial value (latest devotional's month/year).
      setMonth(month);
      setYear(String(yearNum));
      setCalMonthIdx(parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'numeric' }).format(new Date()), 10) - 1);
      setCalYear(yearNum);
    } catch {}
  }, [adminTimezone]);

  // Scripture Reading Fields
  const [scriptureTestament, setScriptureTestament] = useState<string>("New Testament");
  const [scriptureBook, setScriptureBook] = useState<string>("Colossians");
  const [scriptureCV, setScriptureCV] = useState<string>("");
  const [scriptureText, setScriptureText] = useState("");

  // Devotional Content
  const [rawParagraphs, setRawParagraphs] = useState("");

  // Rich Text Editor State History for Undo/Redo
  const [editorHistory, setEditorHistory] = useState<string[]>([""]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Initialize/reset editor history when rawParagraphs is loaded initially or selection changes
  useEffect(() => {
    if (rawParagraphs && (editorHistory.length === 1 && editorHistory[0] === "")) {
      setEditorHistory([rawParagraphs]);
      setHistoryIndex(0);
    }
  }, [rawParagraphs]);

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
  const [ref1Testament, setRef1Testament] = useState<string>("New Testament");
  const [ref1Book, setRef1Book] = useState<string>("");
  const [ref1CV, setRef1CV] = useState<string>("");

  // Additional Reference 2 Fields
  const [ref2Testament, setRef2Testament] = useState<string>("Old Testament");
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
  const [dbr1Testament, setDbr1Testament] = useState<string>("Old Testament");
  const [dbr1Text, setDbr1Text] = useState<string>("");

  const [dbr2Testament, setDbr2Testament] = useState<string>("New Testament");
  const [dbr2Text, setDbr2Text] = useState<string>("");

  // Author field
  const [author, setAuthor] = useState("Dr. Andy Osakwe");

  // Error States
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSuccessToast, setShowSuccessToast] = useState(false);

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

  // Sync internal calendar month index with form's month select
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

  // Handle entering edit mode for a devotional
  const handleStartEdit = (dev: Devotional) => {
    setSelectedDevotional(dev);
    
    // Parse Date "June 07" or "July 1"
    const dateParts = dev.date.trim().split(/\s+/);
    let devMonth = "June";
    let devDay = "1";
    if (dateParts.length === 2) {
      devMonth = dateParts[0];
      devDay = dateParts[1].replace(/^0+/, ""); // Strip leading zeros like "07" -> "7"
    }

    // Prefill all editing states
    setTitle(dev.title);
    setDay(devDay);
    setMonth(devMonth);
    setYear(dev.year.toString());

    // Scripture Reference split or parsing
    // E.g., "Colossians 2:6-7 (NKJV)"
    // Try to match standard "Book CV"
    let bkName = "";
    let chapterAndVerse = "";
    const allBooks = [...OT_BOOKS, ...NT_BOOKS];
    
    // Find matching book in Scripture ref
    const matchedBook = allBooks.find(b => dev.scriptureRef.startsWith(b));
    if (matchedBook) {
      bkName = matchedBook;
      chapterAndVerse = dev.scriptureRef.substring(matchedBook.length).trim();
    } else {
      bkName = "Colossians";
      chapterAndVerse = dev.scriptureRef;
    }

    setScriptureBook(bkName);
    setScriptureTestament(OT_BOOKS.includes(bkName) ? "Old Testament" : "New Testament");
    setScriptureCV(chapterAndVerse);
    setScriptureText(dev.scriptureText);

    // Paragraphs
    setRawParagraphs(dev.paragraphs.join("\n\n"));

    // Additional Scripture References parsing
    // E.g. "Psalm 57:7; Isaiah 26:3; Hebrews 13:6"
    const refs = dev.additionalScripture.split(";").map(r => r.trim()).filter(Boolean);
    
    // Ref 1
    if (refs[0]) {
      const matched = allBooks.find(b => refs[0].startsWith(b));
      if (matched) {
        setRef1Book(matched);
        setRef1Testament(OT_BOOKS.includes(matched) ? "Old Testament" : "New Testament");
        setRef1CV(refs[0].substring(matched.length).trim());
      } else {
        setRef1Book("");
        setRef1CV(refs[0]);
      }
    } else {
      setRef1Book("");
      setRef1CV("");
    }

    // Ref 2
    if (refs[1]) {
      const matched = allBooks.find(b => refs[1].startsWith(b));
      if (matched) {
        setRef2Book(matched);
        setRef2Testament(OT_BOOKS.includes(matched) ? "Old Testament" : "New Testament");
        setRef2CV(refs[1].substring(matched.length).trim());
      } else {
        setRef2Book("");
        setRef2CV(refs[1]);
      }
    } else {
      setRef2Book("");
      setRef2CV("");
    }

    // Ref 3
    if (refs[2]) {
      setShowThirdRef(true);
      const matched = allBooks.find(b => refs[2].startsWith(b));
      if (matched) {
        setRef3Book(matched);
        setRef3Testament(OT_BOOKS.includes(matched) ? "Old Testament" : "New Testament");
        setRef3CV(refs[2].substring(matched.length).trim());
      } else {
        setRef3Book("");
        setRef3CV(refs[2]);
      }
    } else {
      setShowThirdRef(false);
      setRef3Book("");
      setRef3CV("");
    }

    // Prayer / Confession
    setPrayerConfession(dev.prayerConfession);

    // Daily Bible Reading
    // E.g. "2 Chronicles 16-18, John 17"
    const dbrParts = dev.bibleReading.split(",").map(d => d.trim()).filter(Boolean);
    setDbr1Text(dbrParts[0] || "");
    setDbr1Testament(dbrParts[0] && OT_BOOKS.some(b => dbrParts[0].startsWith(b)) ? "Old Testament" : "New Testament");
    
    setDbr2Text(dbrParts[1] || "");
    setDbr2Testament(dbrParts[1] && OT_BOOKS.some(b => dbrParts[1].startsWith(b)) ? "Old Testament" : "New Testament");

    setAuthor(dev.author);
    setErrors({});
    setActiveSubTab("edit");
    setCurrentMode("edit");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackToList = () => {
    setCurrentMode("list");
    setSelectedDevotional(null);
  };

  // Helper to dynamically get books for a testament
  const getBooksForTestament = (testament: string) => {
    if (testament === "Old Testament") return OT_BOOKS;
    if (testament === "New Testament") return NT_BOOKS;
    return [];
  };

  // Calendar Day Click Handler
  const handleCalendarDaySelect = (selectedDay: number) => {
    setDay(selectedDay.toString());
    setMonth(MONTHS[calMonthIdx]);
    setYear(calYear.toString());
    setIsCalendarOpen(false);
  };

  // Calendar calculations
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
    const finalAdditionalScripture = additionalRefsList.join("; ") || "None";

    const dbrList = [];
    if (dbr1Text.trim()) dbrList.push(dbr1Text.trim());
    if (dbr2Text.trim()) dbrList.push(dbr2Text.trim());
    const finalBibleReading = dbrList.join(", ") || "None";

    return {
      id: selectedDevotional?.id || "temp-id",
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

  const handleSubmitUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      window.scrollTo({ top: 120, behavior: "smooth" });
      return;
    }

    const updatedData = getPreviewDevotionalData();
    onUpdate(updatedData);
    
    // Show Toast
    setShowSuccessToast(true);
    setTimeout(() => {
      setShowSuccessToast(false);
      setCurrentMode("list");
      setSelectedDevotional(null);
    }, 2000);
  };

  // When devotionals arrive AFTER this component mounts (async fetch), snap the
  // filter to the latest devotional's month/year IF the user hasn't manually
  // touched the filter AND the current filter would match nothing. This closes
  // the mount-time race where the initializer saw an empty list.
  useEffect(() => {
    if (devotionals.length === 0 || filterTouchedRef.current) return;
    const latest = getLatestDevotionalMonthYear(devotionals);
    if (!latest) return;
    const currentMatchesSomething = devotionals.some(dev =>
      (!filterMonth || dev.date.toLowerCase().startsWith(filterMonth.toLowerCase())) &&
      (!filterYear || dev.year.toString() === filterYear)
    );
    if (!currentMatchesSomething) {
      setFilterMonth(latest.month);
      setFilterYear(latest.year);
    }
  }, [devotionals, filterMonth, filterYear]);

  // Filter administration list — empty filter values mean "All".
  const filteredList = devotionals.filter((dev) => {
    const matchesMonth = !filterMonth || dev.date.toLowerCase().startsWith(filterMonth.toLowerCase());
    const matchesYear = !filterYear || dev.year.toString() === filterYear;
    const matchesSearch = listSearchQuery
      ? dev.title.toLowerCase().includes(listSearchQuery.toLowerCase()) ||
        dev.scriptureRef.toLowerCase().includes(listSearchQuery.toLowerCase())
      : true;
    return matchesMonth && matchesYear && matchesSearch;
  });

  // JCE Word Counter Helper
  const wordCount = rawParagraphs
    ? rawParagraphs.trim().split(/\s+/).filter(Boolean).length
    : 0;

  // Build grid arrays for the interactive popover
  const totalDays = getDaysInMonth(calMonthIdx, calYear);
  const firstDayIndex = getFirstDayIndex(calMonthIdx, calYear);
  const calGridCells = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calGridCells.push(null);
  }
  for (let d = 1; d <= totalDays; d++) {
    calGridCells.push(d);
  }

  const previewDevotional = getPreviewDevotionalData();

  return (
    <div id="list-devotional-page-container" className="space-y-6">
      
      {/* SUCCESS TOAST ALERTS */}
      <AnimatePresence>
        {showSuccessToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3.5 bg-emerald-600 border border-emerald-500 text-white rounded-2xl shadow-2xl flex items-center gap-3 font-serif text-sm font-black uppercase tracking-wider"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Devotional Updated Successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RENDER LIST FILTER PAGE */}
      {currentMode === "list" && (
        <div className="w-full space-y-6 overflow-x-hidden">

          {/* ── Delete Confirmation Modal ─────────────────────────────── */}
          <AnimatePresence>
            {deleteModal.open && (
              <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  onClick={abortDelete}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 16 }}
                  transition={{ type: "spring", damping: 25, stiffness: 350 }}
                  className={`relative w-full max-w-md rounded-3xl p-7 border shadow-2xl text-center space-y-5 ${
                    isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
                  }`}
                >
                  <button onClick={abortDelete} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition-colors">
                    <X className="w-4 h-4" />
                  </button>

                  <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-7 h-7 text-rose-500" />
                  </div>

                  <div>
                    <h3 className="font-serif text-lg font-black text-slate-900 dark:text-white">Confirm Delete</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      You are about to permanently delete <strong>{deleteModal.ids.length}</strong> devotional{deleteModal.ids.length > 1 ? "s" : ""}. This cannot be undone.
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-3">
                    <button
                      onClick={abortDelete}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                        isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Cancel
                    </button>

                    {/* Delete button with live countdown inside */}
                    <button
                      onClick={confirmDelete}
                      className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500 hover:bg-rose-600 text-white transition-all flex items-center justify-center gap-2 relative overflow-hidden"
                    >
                      {/* Countdown drain bar */}
                      <span
                        className="absolute inset-0 bg-rose-700/40 origin-left transition-none"
                        style={{ transform: `scaleX(${deleteCountdown / 8})` }}
                      />
                      <Trash2 className="w-3.5 h-3.5 relative z-10" />
                      <span className="relative z-10">Delete ({deleteCountdown}s)</span>
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-400 font-bold">
                    Auto-aborts in {deleteCountdown}s if no action is taken.
                  </p>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
            <h1 className="font-serif text-2xl md:text-3xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
              <List className="w-7 h-7 text-teal-brand" />
              Manage Devotionals
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-semibold tracking-wide">
              Administrator Console — Filter and Select any Devotional below to edit its content and details.
            </p>
          </div>

          {/* Filtering Section Card */}
          <div className={`p-6 rounded-2xl border ${
            isDarkMode 
              ? "bg-slate-900 border-slate-850 shadow-lg text-slate-100" 
              : "bg-white border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.04)] text-slate-900"
          }`}>
            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Search & Date Filter
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              {/* Month Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Month
                </label>
                <select
                  value={filterMonth}
                  onChange={(e) => { filterTouchedRef.current = true; setFilterMonth(e.target.value); }}
                  className={`w-full py-2 px-3 text-xs font-bold border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-250 text-slate-900"
                  }`}
                >
                  <option value="">All Months</option>
                  {MONTHS.map((m) => (
                    <option key={`filter-m-${m}`} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              {/* Year Dropdown */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Year
                </label>
                <select
                  value={filterYear}
                  onChange={(e) => { filterTouchedRef.current = true; setFilterYear(e.target.value); }}
                  className={`w-full py-2 px-3 text-xs font-bold border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-250 text-slate-900"
                  }`}
                >
                  <option value="">All Years</option>
                  {Array.from({ length: 15 }, (_, i) => (2035 - i).toString()).map((yr) => (
                    <option key={`filter-y-${yr}`} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>

              {/* Keyword Search */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Search by Title / Scripture
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search Title..."
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    className={`w-full py-2.5 pl-9 pr-4 text-xs font-bold border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-250 text-slate-900 placeholder-slate-400"
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bulk action toolbar — shown when items are selected */}
          {selectedIds.size > 0 && (
            <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
              isDarkMode ? "bg-rose-950/30 border-rose-900/50" : "bg-rose-50 border-rose-200"
            }`}>
              <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                {selectedIds.size} devotional{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                    isDarkMode ? "border-slate-700 text-slate-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-900"
                  }`}
                >
                  Deselect All
                </button>
                <button
                  onClick={() => openDeleteModal(Array.from(selectedIds))}
                  className="text-xs font-black px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected
                </button>
              </div>
            </div>
          )}

          {/* Devotionals Table List */}
          <div className={`border rounded-2xl overflow-hidden shadow-sm ${
            isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
          }`}>
            <div className="overflow-x-hidden w-full">
              <table className="w-full text-left text-xs border-collapse table-fixed">
                <thead>
                  <tr className={`border-b font-serif text-[10px] font-black uppercase tracking-wider ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
                  }`}>
                    {/* Select-all checkbox */}
                    <th className="py-3 pl-4 pr-2 w-[4%]">
                      <input
                        type="checkbox"
                        checked={filteredList.length > 0 && filteredList.every(d => selectedIds.has(d.id))}
                        onChange={() => toggleSelectAll(filteredList.map(d => d.id))}
                        className="w-3.5 h-3.5 accent-teal-brand cursor-pointer"
                        title="Select all"
                      />
                    </th>
                    <th className="py-3 px-4 w-[11%]">Date</th>
                    <th className="py-3 px-4 w-[28%]">Title</th>
                    <th className="py-3 px-4 w-[20%]">Scripture</th>
                    <th className="py-3 px-4 w-[11%]">Author</th>
                    <th className="py-3 px-4 w-[13%]">Reactions</th>
                    <th className="py-3 px-4 w-[13%] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-850 font-semibold">
                  {filteredList.length > 0 ? (
                    filteredList.map((dev) => {
                      // No fake seeded reaction counts — the admin list shows the
                      // real state (empty until visitors actually react on the site).
                      const isChecked = selectedIds.has(dev.id);

                      return (
                        <tr
                          key={`admin-dev-${dev.id}`}
                          onClick={() => handleStartEdit(dev)}
                          className={`cursor-pointer transition-colors group ${
                            isChecked
                              ? isDarkMode ? "bg-teal-brand/10" : "bg-teal-brand/5"
                              : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                          }`}
                        >
                          {/* Row checkbox */}
                          <td className="py-3.5 pl-4 pr-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelect(dev.id)}
                              className="w-3.5 h-3.5 accent-teal-brand cursor-pointer"
                            />
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-500 dark:text-slate-400 font-bold truncate">
                            {dev.date}, {dev.year}
                          </td>
                          <td className="py-3.5 px-4 font-serif text-slate-900 dark:text-white font-black group-hover:text-teal-brand transition-colors text-xs truncate">
                            {dev.title}
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 truncate">
                            {dev.scriptureRef}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 truncate">
                            {dev.author}
                          </td>
                          <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 flex-wrap">
                              {(() => {
                                const counts = reactionCounts[dev.id];
                                const entries = counts
                                  ? (Object.entries(counts) as [string, number][]).filter(([, c]) => c > 0)
                                  : [];
                                if (entries.length === 0) {
                                  return (
                                    <span className="text-[9px] text-slate-400 italic font-semibold">No reactions yet</span>
                                  );
                                }
                                return entries.map(([emoji, cnt]) => (
                                  <span
                                    key={`${dev.id}-${emoji}`}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold"
                                    title={`${cnt} reaction${cnt === 1 ? "" : "s"}`}
                                  >
                                    <span className="text-xs leading-none">{emoji}</span>
                                    <span className="text-slate-600 dark:text-slate-300 font-mono">{cnt}</span>
                                  </span>
                                ));
                              })()}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(dev)}
                                className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-black bg-teal-brand/10 text-teal-brand hover:bg-teal-brand hover:text-white transition-all uppercase tracking-wider whitespace-nowrap"
                              >
                                <Edit3 className="w-3 h-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal([dev.id])}
                                className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg text-[10px] font-black bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-all uppercase tracking-wider whitespace-nowrap"
                                title="Delete this devotional"
                              >
                                <Trash2 className="w-3 h-3" />
                                Del
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-12 text-center font-serif text-xs font-black italic text-slate-400 dark:text-slate-500">
                        No devotionals match the filter criteria ({filterMonth} {filterYear}).
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination / Table footer details */}
            <div className={`px-5 py-3 border-t text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 flex justify-between ${
              isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50/50 border-slate-100"
            }`}>
              <span>Total Records: {filteredList.length} Devotionals</span>
              <span>Filter: {filterMonth} {filterYear}</span>
            </div>
          </div>
        </div>
      )}

      {/* RENDER EDIT MODE (MATCHING THE ADDDEVOTIONAL.TSX ENVIRONMENT) */}
      {currentMode === "edit" && selectedDevotional && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          
          {/* Back button and page title bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleBackToList}
                className={`p-2 border rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center ${
                  isDarkMode ? "bg-slate-900 border-slate-800 text-white hover:bg-slate-800" : "bg-white border-slate-200 text-slate-900 hover:bg-slate-50"
                }`}
                title="Back to List View"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="font-serif text-lg md:text-xl font-black text-black dark:text-white uppercase tracking-tight">
                  Edit Devotional
                </h1>
                <p className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">
                  ID: {selectedDevotional.id} | Originally {selectedDevotional.date}
                </p>
              </div>
            </div>

            {/* Sub-tabs header layout to allow instant Live Preview previewing */}
            <div className="flex items-center gap-1.5 md:gap-4">
              <button
                type="button"
                onClick={() => setActiveSubTab("edit")}
                className={`py-1.5 px-3 font-serif text-xs md:text-sm font-black uppercase tracking-wide border-b-2 transition-all ${
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
                className={`py-1.5 px-3 font-serif text-xs md:text-sm font-black uppercase tracking-wide border-b-2 transition-all flex items-center gap-1.5 ${
                  activeSubTab === "preview"
                    ? "border-black text-black dark:border-white dark:text-white"
                    : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Live Preview
              </button>
            </div>
          </div>

          {/* Form Editor Subtab Panel */}
          {activeSubTab === "edit" ? (
            <div className="space-y-6">
              <form onSubmit={handleSubmitUpdate} className="space-y-6 text-xs sm:text-sm font-semibold">
                
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
                        <option key={`edit-day-${d}`} value={d}>{d}</option>
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
                        <option key={`edit-month-${m}`} value={m}>{m}</option>
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
                        <option key={`edit-year-${yr}`} value={yr}>{yr}</option>
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

                    {/* INTERACTIVE CALENDAR POPUP */}
                    {isCalendarOpen && (
                      <div 
                        ref={calendarRef}
                        className={`absolute left-0 sm:left-auto sm:right-0 md:left-0 top-12 z-50 p-4 rounded-xl border shadow-2xl w-72 transition-all animate-in fade-in slide-in-from-top-1 ${
                          isDarkMode ? "bg-slate-950 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}
                      >
                        {/* Calendar Header */}
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
                            <div key={`cal-w-${w}`}>{w}</div>
                          ))}
                        </div>

                        {/* Day Cells */}
                        <div className="grid grid-cols-7 gap-1">
                          {calGridCells.map((dVal, idx) => {
                            if (dVal === null) {
                              return <div key={`edit-empty-${idx}`} />;
                            }
                            const isCurrentlySelected = 
                              day === dVal.toString() && 
                              month === MONTHS[calMonthIdx] && 
                              year === calYear.toString();

                            return (
                              <button
                                type="button"
                                key={`edit-cal-day-${dVal}`}
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

                        {/* Quick Year selector inside calendar popover */}
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
                              <option key={`cal-sel-yr-${yr}`} value={yr}>{yr}</option>
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
                        setScriptureBook("");
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
                        <option key={`edit-scr-bk-${bk}`} value={bk}>{bk}</option>
                      ))}
                    </select>

                    {/* Chapter/Verse input */}
                    <input
                      type="text"
                      placeholder="Chapter / Verse"
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
                        <option key={`edit-ref1-bk-${bk}`} value={bk}>{bk}</option>
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
                        <option key={`edit-ref2-bk-${bk}`} value={bk}>{bk}</option>
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
                    id="edit-showThirdRef"
                    checked={showThirdRef}
                    onChange={(e) => setShowThirdRef(e.target.checked)}
                    className="w-4 h-4 rounded text-black border-slate-300 focus:ring-black accent-black cursor-pointer"
                  />
                  <label htmlFor="edit-showThirdRef" className="text-slate-950 dark:text-slate-100 font-black cursor-pointer">
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
                          <option key={`edit-ref3-bk-${bk}`} value={bk}>{bk}</option>
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

                {/* Submit / Update Button */}
                <div className="pt-4 flex gap-4">
                  <button
                    type="submit"
                    className="py-1.5 px-6 bg-teal-brand hover:bg-teal-brand/95 text-white font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase shadow-md"
                  >
                    Update Devotional
                  </button>
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="py-1.5 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase"
                  >
                    Cancel
                  </button>
                </div>

              </form>
            </div>
          ) : (
            
            /* Live Preview Mode (Matching precise view of DevotionalView) */
            <div className="animate-in fade-in duration-200 space-y-6">
              <div className={`p-6 md:p-8 rounded-3xl border ${
                isDarkMode ? "bg-slate-950 border-slate-900 text-slate-100" : "bg-white border-slate-200 text-slate-900 shadow-xl"
              }`}>
                {/* Date header */}
                <div className="flex items-center gap-2 text-xs font-mono font-black text-red-600 uppercase tracking-widest mb-4">
                  <Calendar className="w-4 h-4" />
                  <span>{previewDevotional.date}, {previewDevotional.year}</span>
                </div>

                {/* Devotional Title */}
                <h2 className="font-serif text-2xl md:text-3xl font-black text-slate-950 dark:text-white uppercase tracking-tight leading-tight mb-4 break-words">
                  {previewDevotional.title}
                </h2>

                {/* Author tagline */}
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold mb-6 uppercase tracking-wider">
                  By {previewDevotional.author}
                </p>

                {/* Scripture Reading Section */}
                <div className={`p-5 rounded-2xl border mb-6 ${
                  isDarkMode ? "bg-slate-900/60 border-slate-800/80" : "bg-slate-50 border-slate-150"
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-black text-slate-950 dark:text-white uppercase tracking-wider mb-2">
                    <BookOpen className="w-4 h-4 text-teal-brand" />
                    <span>Scripture Reading: {previewDevotional.scriptureRef}</span>
                  </div>
                  <p className="text-xs sm:text-sm font-serif italic text-slate-800 dark:text-slate-200 leading-relaxed pl-1">
                    "{previewDevotional.scriptureText}"
                  </p>
                </div>

                {/* Main Body Paragraphs */}
                <div className="space-y-4 font-sans text-xs sm:text-sm text-slate-800 dark:text-slate-300 leading-relaxed font-medium">
                  {previewDevotional.paragraphs.map((p, idx) => (
                    <p
                      key={`preview-para-${idx}`}
                      className="indent-4 sm:indent-8"
                      dangerouslySetInnerHTML={{ __html: p }}
                    />
                  ))}
                </div>

                {/* Additional Scriptures */}
                <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-900">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Additional Scripture Readings:
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mt-1 pl-1">
                    {previewDevotional.additionalScripture}
                  </p>
                </div>

                {/* Prayer & Confession of Faith */}
                <div className={`mt-6 p-6 rounded-2xl border-l-4 border-red-600 ${
                  isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-red-50/40 border-slate-150"
                }`}>
                  <div className="flex items-center gap-1.5 text-xs font-black text-red-600 uppercase tracking-widest mb-2">
                    <Quote className="w-4 h-4 fill-red-600/10" />
                    <span>Prayer & Confession of Faith</span>
                  </div>
                  <p className="font-serif text-xs sm:text-sm italic text-slate-900 dark:text-white leading-relaxed">
                    {previewDevotional.prayerConfession}
                  </p>
                </div>

                {/* Daily Bible Reading */}
                <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-900">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Daily Bible Reading Plan:
                  </p>
                  <p className="text-xs font-bold text-slate-900 dark:text-white mt-1 pl-1">
                    {previewDevotional.bibleReading}
                  </p>
                </div>

              </div>

              {/* Action buttons inside preview view */}
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("edit")}
                  className="py-1.5 px-4 bg-slate-800 hover:bg-slate-900 text-white font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase"
                >
                  Return to Editor
                </button>
                <button
                  type="button"
                  onClick={handleSubmitUpdate}
                  className="py-1.5 px-6 bg-teal-brand hover:bg-teal-brand/95 text-white font-black tracking-wide rounded hover:scale-[1.01] active:scale-[0.99] transition-all text-xs uppercase"
                >
                  Update Devotional
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
