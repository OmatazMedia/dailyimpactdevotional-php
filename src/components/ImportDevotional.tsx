import React, { useState, useRef, useEffect } from "react";
import mammoth from "mammoth";
import { Devotional } from "../types";
import { API_BASE } from "../config/api";
import { 
  FileText, 
  Upload, 
  Trash2, 
  Plus, 
  Save, 
  CheckCircle, 
  AlertTriangle, 
  ChevronRight, 
  BookOpen, 
  ChevronLeft, 
  Edit, 
  Info,
  ArrowRight,
  Eye,
  Calendar
} from "lucide-react";

interface ImportDevotionalProps {
  onSaveMultiple: (devotionals: Omit<Devotional, "id">[]) => void;
  existingDevotionals: Devotional[];
  isDarkMode: boolean;
  onCancel: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ImportDevotional({ 
  onSaveMultiple, 
  existingDevotionals, 
  isDarkMode, 
  onCancel 
}: ImportDevotionalProps) {
  const [adminTimezone, setAdminTimezone] = useState("Africa/Lagos");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data?.admin_timezone) setAdminTimezone(data.admin_timezone);
      })
      .catch(() => {});
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10);
    } catch { return new Date().getFullYear(); }
  });
  useEffect(() => {
    try {
      setSelectedMonth(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date()));
      setSelectedYear(parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10));
    } catch {}
  }, [adminTimezone]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Parsed devotionals draft list
  const [parsedList, setParsedList] = useState<Omit<Devotional, "id">[]>([]);
  // Currently selected devotional index in review panel
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadedFileRef = useRef<File | null>(null);

  // File Upload Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  // Parsing Engine
  const processFile = async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      setError("Only Microsoft Word (.docx) files are supported. Please upload a valid .docx file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setParsedList([]);
    setSelectedIndex(null);
    uploadedFileRef.current = file;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      try {
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value;
        
        if (!text || text.trim() === "") {
          throw new Error("No readable text found in this file.");
        }

        const devotionals = parseDocxText(text, selectedMonth, selectedYear);
        if (devotionals.length === 0) {
          setError(
            "We couldn't detect any structured days in the document. " +
            "Please check if the document structure matches the daily format " +
            "(e.g., 'Monday, June 1' followed by Title, Scripture, and Body paragraph(s))."
          );
        } else {
          setParsedList(devotionals);
          setSelectedIndex(0); // Select first day for review
        }
      } catch (err: any) {
        console.error(err);
        setError(`Failed to parse document: ${err.message || "Unknown error during text extraction."}`);
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = () => {
      setError("Failed to read file.");
      setIsLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const parseDocxText = (text: string, defaultMonth: string, defaultYear: number): Omit<Devotional, "id">[] => {
    // 1. Split text into lines and clean whitespace
    const rawLines = text.split(/\r?\n/);
    const lines = rawLines.map(l => l.trim());

    const ALL_BIBLE_BOOKS = [
      "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
      "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
      "Nehemiah", "Esther", "Job", "Psalms", "Psalm", "Proverbs", "Ecclesiastes", "Song of Solomon",
      "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
      "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi",
      "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians",
      "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians", "2 Thessalonians",
      "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James", "1 Peter", "2 Peter",
      "1 John", "2 John", "3 John", "Jude", "Revelation"
    ];

    const MONTHS_LIST = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const monthsPattern = MONTHS_LIST.join("|");
    const daysOfWeekPattern = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";

    // ── Label matchers ────────────────────────────────────────────────────────
    const ADDITIONAL_SCRIPTURE_RE = /^additional\s+scripture\s*(?:reference(?:s)?)?(?:\s*\(s\))?[:：]\s*/i;
    const PRAYER_RE = /^(?:prayer\s*(?:and|&)\s*confession(?:\s+of\s+faith)?|confession\s+of\s+faith|prayer\s+and\s+confession)[:：]\s*/i;
    const BIBLE_READING_RE = /^(?:daily\s+)?bible\s+reading[:：]\s*/i;

    // Trailing garbage stripper — removes any section label that crept onto the
    // end of an extracted value (e.g. "Philippians 4:6-7Prayer and" → "Philippians 4:6-7")
    const stripTrailingLabel = (val: string): string => {
      return val
        // strip trailing "Prayer and..." / "Prayer & Confession..." etc.
        .replace(/\s*Prayer\s*(?:and|&)?\s*(?:Confession)?(?:\s+of\s+Faith)?[:：]?.*$/i, "")
        // strip trailing "Daily Bible Reading..." / "Bible Reading..."
        .replace(/\s*(?:Daily\s+)?Bible\s+Reading[:：]?.*$/i, "")
        // strip trailing "Confession of Faith..."
        .replace(/\s*Confession\s+of\s+Faith[:：]?.*$/i, "")
        .trim();
    };

    // Inline splitter — splits a line wherever a known section label appears
    // mid-string (mammoth often merges them with no newline)
    const splitAtLabels = (line: string): string[] => {
      // lookahead — works even when there's no whitespace before the label word
      const SPLIT_PATTERN = /(?=Additional\s+Scripture\s*(?:Reference(?:s)?)?(?:\s*\(s\))?[:：]|Prayer\s*(?:and|&)\s*Confession(?:\s+of\s+Faith)?[:：]|Confession\s+of\s+Faith[:：]|Daily\s+Bible\s+Reading[:：]|Bible\s+Reading[:：])/i;
      const parts = line.split(SPLIT_PATTERN).map(p => p.trim()).filter(Boolean);
      return parts.length > 1 ? parts : [line];
    };

    const isAdditionalScriptureLine = (l: string) => ADDITIONAL_SCRIPTURE_RE.test(l);
    const isPrayerLine = (l: string) => PRAYER_RE.test(l);
    const isBibleReadingLine = (l: string) => BIBLE_READING_RE.test(l);

    const isSectionLabel = (l: string) =>
      isAdditionalScriptureLine(l) || isPrayerLine(l) || isBibleReadingLine(l);

    // ── Date line detection ───────────────────────────────────────────────────
    const isDateLine = (line: string): boolean => {
      const clean = line.trim();
      const ordinal = "(?:st|nd|rd|th)?";
      // "Monday, June 1" / "June 1" / "June 1st, 2025"
      const formA = new RegExp(`^(?:(?:${daysOfWeekPattern}),?\\s*)?(${monthsPattern})\\s+(\\d{1,2})${ordinal}(?:,?\\s+\\d{4})?$`, "i");
      // "1 June" / "1st June 2025"
      const formB = new RegExp(`^(\\d{1,2})${ordinal}\\s+(${monthsPattern})(?:,?\\s+\\d{4})?$`, "i");
      // "Monday, 1" / "Monday 1" — no month name; resolved via selected month
      const formC = new RegExp(`^(?:${daysOfWeekPattern}),?\\s+(\\d{1,2})${ordinal}$`, "i");
      return formA.test(clean) || formB.test(clean) || formC.test(clean);
    };

    const parseDateLine = (line: string, dMonth: string, dYear: number) => {
      const clean = line.trim();
      const dowPrefix = new RegExp(`^(?:(?:${daysOfWeekPattern}),?\\s*)`, "i");
      const content = clean.replace(dowPrefix, "").trim();
      const ordinal = "(?:st|nd|rd|th)?";

      const formA = new RegExp(`^(${monthsPattern})\\s+(\\d{1,2})${ordinal}(?:,?\\s+(\\d{4}))?$`, "i");
      const mA = content.match(formA);
      if (mA) {
        const mon = MONTHS_LIST.find(m => m.toLowerCase() === mA[1].toLowerCase()) || dMonth;
        return { month: mon, day: parseInt(mA[2], 10), year: mA[3] ? parseInt(mA[3], 10) : dYear };
      }
      const formB = new RegExp(`^(\\d{1,2})${ordinal}\\s+(${monthsPattern})(?:,?\\s+(\\d{4}))?$`, "i");
      const mB = content.match(formB);
      if (mB) {
        const mon = MONTHS_LIST.find(m => m.toLowerCase() === mB[2].toLowerCase()) || dMonth;
        return { month: mon, day: parseInt(mB[1], 10), year: mB[3] ? parseInt(mB[3], 10) : dYear };
      }
      // "Monday, 1" / "Monday 1" — no month in line, fall back to selected month
      const formC = new RegExp(`^(?:${daysOfWeekPattern}),?\\s+(\\d{1,2})${ordinal}$`, "i");
      const mC = content.match(formC);
      if (mC) {
        return { month: dMonth, day: parseInt(mC[1], 10), year: dYear };
      }
      return null;
    };

    // ── Scripture reference normalisation ────────────────────────────────────
    const normalizeScriptureRefs = (raw: string): string => {
      if (!raw || !raw.trim()) return "None";
      const refs: string[] = [];
      let cur = "";
      for (const part of raw.split(/[;,]/).map(p => p.trim()).filter(Boolean)) {
        const startsNew = ALL_BIBLE_BOOKS.some(b =>
          part.toLowerCase().startsWith(b.toLowerCase()) ||
          new RegExp(`^\\d+\\s+${b}`, "i").test(part)
        );
        if (startsNew) { if (cur) refs.push(cur); cur = part; }
        else { cur = cur ? `${cur}, ${part}` : part; }
      }
      if (cur) refs.push(cur);
      return refs.join("; ") || "None";
    };

    // ── Segment document into per-day blocks ─────────────────────────────────
    // Pre-process: split any line that contains an inline section label boundary
    const processedLines = lines.flatMap(l => splitAtLabels(l));

    interface Block { dateLine: string; contentLines: string[]; }
    const blocks: Block[] = [];
    let cur: Block | null = null;

    for (const line of processedLines) {
      if (isDateLine(line)) {
        if (cur) blocks.push(cur);
        cur = { dateLine: line, contentLines: [] };
      } else if (cur) {
        cur.contentLines.push(line);
      }
    }
    if (cur) blocks.push(cur);

    // ── Document-level year detection ────────────────────────────────────────
    // Past-month files often omit the year on each day's date line (e.g.
    // "Monday, June 1") but include it once in a header like "JUNE 2025".
    // Without this, every such day would be stamped with the CURRENT year and
    // then never appear when the admin filters by the file's actual month/year.
    let docYear = defaultYear;
    const monthYearMatch = text.match(new RegExp(`(${monthsPattern})\\s*,?\\s+(19|20)\\d{2}`, "i"));
    if (monthYearMatch) {
      const yr = parseInt(monthYearMatch[0].match(/\\d{4}$/)?.[0] ?? "", 10);
      if (yr >= 2000 && yr <= 2100) docYear = yr;
    } else {
      // Fallback: first standalone 4-digit year in the opening lines
      const head = text.slice(0, 1500);
      const yearMatch = head.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        const yr = parseInt(yearMatch[0], 10);
        if (yr >= 2000 && yr <= 2100) docYear = yr;
      }
    }

    // ── Parse each block ──────────────────────────────────────────────────────
    const result: Omit<Devotional, "id">[] = [];

    for (const block of blocks) {
      const dateInfo = parseDateLine(block.dateLine, defaultMonth, docYear);
      const finalMonth = dateInfo?.month ?? defaultMonth;
      const finalDay   = dateInfo?.day   ?? 1;
      const finalYear  = dateInfo?.year  ?? docYear;
      const dayPad = finalDay < 10 ? `0${finalDay}` : `${finalDay}`;
      const dateStr = `${finalMonth} ${dayPad}`;

      const cl = block.contentLines;

      // ── Title: first non-empty line ───────────────────────────────────────
      let titleIdx = cl.findIndex(l => l.trim() !== "");
      const title = titleIdx >= 0 ? cl[titleIdx].trim() : "Untitled Devotional";

      // ── Anchor scripture: line(s) immediately after title that look like
      //    scripture (contain " – BookName " or "(NKJV/NIV/...)" etc.)
      //    Could also be TWO scripture lines before the body starts.
      const VERSE_SUFFIX_RE = /[\u2013\u2014\u2012-]\s*(?:\d+\s+)?(?:[A-Z][a-z]+\s+)+\d+[:]\d+/;
      const TRANSLATION_RE  = /\((NKJV|NIV|AMP|KJV|ESV|NLT|MSG|NRSV|RSV|CEV|TLB|GNB|NASB|ISV|WEB|TEV)\)/i;
      const SCRIPTURE_LINE_RE = /[\u2013\u2014-]|NKJV|NIV|AMP|KJV|ESV|NLT|MSG|NRSV|Psalm|Proverbs|John|Romans|Isaiah|Matthew|Luke|Acts|Genesis|Philippians|Ephesians|Colossians|Timothy|Corinthians|Hebrews|James|Peter|Revelation/i;

      const isScriptureLine = (l: string): boolean => {
        const t = l.trim();
        if (!t) return false;
        return VERSE_SUFFIX_RE.test(t) || TRANSLATION_RE.test(t);
      };

      // Collect up to 2 consecutive scripture lines right after title
      let scriptureRaw = "";
      let lastScriptureIdx = titleIdx;

      if (titleIdx >= 0) {
        for (let j = titleIdx + 1; j < cl.length && j <= titleIdx + 4; j++) {
          const l = cl[j].trim();
          if (!l) continue;
          if (isSectionLabel(l)) break;
          if (isScriptureLine(l)) {
            scriptureRaw = scriptureRaw ? scriptureRaw + " " + l : l;
            lastScriptureIdx = j;
          } else {
            break; // Body starts here
          }
        }
      }

      // Parse anchor scripture text + ref from scriptureRaw
      let scriptureText = scriptureRaw;
      let scriptureRef  = "";
      if (scriptureRaw) {
        // Split on dash/emdash before book reference
        const sepMatch = scriptureRaw.match(/^(.*?)\s*[\u2013\u2014\u2012-]\s*((?:\d+\s+)?[A-Z][a-zA-Z\s]+\d+[:]\d+(?:[-]\d+)?(?:\s*\([^)]+\))?)\s*$/);
        if (sepMatch) {
          scriptureText = sepMatch[1].replace(/^["'"'\s]+|["'"'\s]+$/g, "").trim();
          scriptureRef  = sepMatch[2].trim();
        } else {
          // Try to find translation token and extract ref from end
          const transMatch = scriptureRaw.match(/^(.*?)\s+((?:\d+\s+)?[A-Z][a-zA-Z\s]*\d+[:]\d+[-\d]*\s*\([^)]+\))\s*$/);
          if (transMatch) {
            scriptureText = transMatch[1].replace(/^["'"'\s]+|["'"'\s]+$/g, "").trim();
            scriptureRef  = transMatch[2].trim();
          }
        }
      }
      if (!scriptureRef) scriptureRef = "Scripture Reference";
      if (!scriptureText) scriptureText = scriptureRaw || "Scripture Passage";

      // ── Find section-label line indices ───────────────────────────────────
      let addScripIdx = -1;
      let prayerIdx   = -1;
      let readingIdx  = -1;

      for (let j = lastScriptureIdx + 1; j < cl.length; j++) {
        const l = cl[j].trim();
        if (!l) continue;
        if (addScripIdx === -1 && isAdditionalScriptureLine(l)) { addScripIdx = j; continue; }
        if (prayerIdx   === -1 && isPrayerLine(l))              { prayerIdx   = j; continue; }
        if (readingIdx  === -1 && isBibleReadingLine(l))        { readingIdx  = j; continue; }
      }

      // ── Body paragraphs: everything between last scripture and first label,
      //    EXCLUDING any lines that are themselves labelled sections          ──
      const bodyEnd = [addScripIdx, prayerIdx, readingIdx]
        .filter(i => i > lastScriptureIdx)
        .reduce((min, i) => (i < min ? i : min), cl.length);

      const paragraphs: string[] = [];
      let para = "";
      for (let j = lastScriptureIdx + 1; j < bodyEnd; j++) {
        const l = cl[j].trim();
        // Skip any line that is a section label (safety net)
        if (isSectionLabel(l)) break;
        if (!l) {
          if (para) { paragraphs.push(para); para = ""; }
        } else {
          para = para ? `${para} ${l}` : l;
        }
      }
      if (para) paragraphs.push(para);

      // ── Additional Scripture Reference(s) ────────────────────────────────
      let additionalScripture = "None";
      if (addScripIdx !== -1) {
        const ends = [prayerIdx, readingIdx].filter(i => i > addScripIdx);
        const end  = ends.length ? Math.min(...ends) : cl.length;
        const raw  = cl.slice(addScripIdx, end).filter(l => l.trim()).join(" ");
        // Strip the label prefix, then strip any trailing section label that crept in
        const stripped = stripTrailingLabel(raw.replace(ADDITIONAL_SCRIPTURE_RE, "").trim());
        // Final validation — only keep if it looks like a scripture reference
        // (contains digits with colon/hyphen pattern, e.g. "4:6-7" or "27")
        const validated = stripped
          .split(/[;]/)
          .map(r => r.trim())
          .filter(r => r.length > 0 && /\d/.test(r))
          .join("; ");
        additionalScripture = normalizeScriptureRefs(validated) || "None";
      }

      // ── Prayer & Confession ───────────────────────────────────────────────
      let prayerConfession = "";
      if (prayerIdx !== -1) {
        const ends = [addScripIdx, readingIdx].filter(i => i > prayerIdx);
        const end  = ends.length ? Math.min(...ends) : cl.length;
        const raw  = cl.slice(prayerIdx, end).filter(l => l.trim()).join("\n\n");
        prayerConfession = raw.replace(PRAYER_RE, "").trim();
      }

      // ── Daily Bible Reading ───────────────────────────────────────────────
      let bibleReading = "None";
      if (readingIdx !== -1) {
        const ends = [addScripIdx, prayerIdx].filter(i => i > readingIdx);
        const end  = ends.length ? Math.min(...ends) : cl.length;
        const raw  = cl.slice(readingIdx, end).filter(l => l.trim()).join(" ");
        bibleReading = raw.replace(BIBLE_READING_RE, "").trim() || "None";
      }

      result.push({
        date: dateStr,
        year: finalYear,
        title,
        scriptureRef,
        scriptureText,
        paragraphs: paragraphs.length > 0 ? paragraphs : ["Daily devotional text..."],
        additionalScripture,
        prayerConfession: prayerConfession || "Prayer & Confession...",
        bibleReading,
        author: "Dr. Andy Osakwe",
      });
    }

    return result;
  };
  // Edit current selected parsed devotional draft
  const handleUpdateDraftField = (field: keyof Omit<Devotional, "id">, value: any) => {
    if (selectedIndex === null) return;
    const newList = [...parsedList];
    newList[selectedIndex] = {
      ...newList[selectedIndex],
      [field]: value
    };
    setParsedList(newList);
  };

  const handleUpdateDraftParagraph = (pIndex: number, value: string) => {
    if (selectedIndex === null) return;
    const newList = [...parsedList];
    const paragraphs = [...newList[selectedIndex].paragraphs];
    paragraphs[pIndex] = value;
    newList[selectedIndex] = {
      ...newList[selectedIndex],
      paragraphs
    };
    setParsedList(newList);
  };

  const handleAddParagraphToDraft = () => {
    if (selectedIndex === null) return;
    const newList = [...parsedList];
    const paragraphs = [...newList[selectedIndex].paragraphs, ""];
    newList[selectedIndex] = {
      ...newList[selectedIndex],
      paragraphs
    };
    setParsedList(newList);
  };

  const handleRemoveParagraphFromDraft = (pIndex: number) => {
    if (selectedIndex === null) return;
    const newList = [...parsedList];
    const paragraphs = newList[selectedIndex].paragraphs.filter((_, i) => i !== pIndex);
    newList[selectedIndex] = {
      ...newList[selectedIndex],
      paragraphs: paragraphs.length > 0 ? paragraphs : [""]
    };
    setParsedList(newList);
  };

  // Delete draft day
  const handleDeleteDraft = (index: number) => {
    const newList = parsedList.filter((_, i) => i !== index);
    setParsedList(newList);
    if (selectedIndex !== null) {
      if (newList.length === 0) {
        setSelectedIndex(null);
      } else if (selectedIndex >= newList.length) {
        setSelectedIndex(newList.length - 1);
      }
    }
  };

  // Add draft day on the fly
  const handleAddNewDraftDay = () => {
    const newDayNum = parsedList.length + 1;
    const formattedDay = newDayNum < 10 ? `0${newDayNum}` : `${newDayNum}`;
    const newDraft: Omit<Devotional, "id"> = {
      date: `${selectedMonth} ${formattedDay}`,
      year: selectedYear,
      title: "New Devotional Title",
      scriptureRef: "John 3:16 (NKJV)",
      scriptureText: "For God so loved the world...",
      paragraphs: ["Write or paste daily devotional content here."],
      additionalScripture: "None",
      prayerConfession: "Dear Father, thank you...",
      bibleReading: "John 3",
      author: "Dr. Andy Osakwe"
    };

    setParsedList([...parsedList, newDraft]);
    setSelectedIndex(parsedList.length);
  };

  // Save all drafts to database + upload the DOCX file to server
  const handleSaveAll = async () => {
    if (parsedList.length === 0 || isSaving) return;
    setIsSaving(true);

    // First upload the original DOCX file to the server
    if (uploadedFileRef.current) {
      try {
        const formData = new FormData();
        formData.append("file", uploadedFileRef.current);
        formData.append("type", "devotional_docx");
        formData.append("month", selectedMonth);
        formData.append("year", String(selectedYear));
        formData.append("fileName", uploadedFileRef.current.name);

        const res = await fetch(`${API_BASE}/upload.php`, { method: "POST", body: formData });
        const json = await res.json() as { success?: boolean; filePath?: string; error?: string };
        if (!res.ok || !json.success) {
          console.warn("DOCX file upload warning:", json.error || "HTTP " + res.status);
          // Non-blocking — still save the parsed devotionals even if file upload fails
        }
      } catch (e) {
        console.warn("DOCX file upload error:", e);
        // Non-blocking
      }
    }

    try {
      await onSaveMultiple(parsedList);
    } finally {
      // Always reset the saving flag, even when the save fails (errors rethrow
      // so the Dashboard's try/catch can show a failure toast).
      setIsSaving(false);
    }
  };

  // Check how many have date conflicts
  const duplicateCount = parsedList.filter(p => 
    existingDevotionals.some(e => e.date === p.date && e.year === p.year)
  ).length;

  return (
    <div id="import-devotional-tab" className="space-y-6">
      <div className="border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-center">
        <div>
          <h1 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight">
            Bulk Import Devotionals
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Upload a Word document (.docx) to automatically parse, review, and import a whole month of devotionals.
          </p>
        </div>
        <button
          onClick={onCancel}
          className="text-xs py-1.5 px-3 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold uppercase rounded-lg hover:opacity-90 active:scale-95 transition-all border border-slate-200 dark:border-slate-800"
        >
          Cancel
        </button>
      </div>

      {parsedList.length === 0 ? (
        <div className="max-w-xl mx-auto space-y-6 pt-4">
          {/* Settings Month and Year */}
          <div className={`p-6 rounded-2xl border ${isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"} shadow-sm space-y-4`}>
            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-brand animate-pulse" />
              1. Setup Target Month & Year
            </h3>
            <p className="text-[11px] text-slate-400">
              Select the default month and year of the devotional file. The parser will map text headers to this calendar timeline.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Target Month</label>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className={`w-full py-2 px-3 text-xs font-bold border rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-brand ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Target Year</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className={`w-full py-2 px-3 text-xs font-bold border rounded-xl focus:outline-none focus:ring-1 focus:ring-teal-brand ${
                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  {Array.from({ length: 11 }, (_, i) => (2025 + i)).map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Upload Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`p-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              isDragOver 
                ? "border-teal-brand bg-teal-brand/5 scale-[1.01]" 
                : isDarkMode 
                  ? "border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700" 
                  : "border-slate-200 bg-white hover:bg-slate-50/50 hover:border-slate-300"
            } shadow-sm group`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".docx"
              className="hidden"
            />
            {isLoading ? (
              <div className="space-y-3">
                <div className="w-10 h-10 border-4 border-teal-brand/30 border-t-teal-brand rounded-full animate-spin mx-auto" />
                <p className="text-xs font-bold text-slate-500 animate-pulse">Scanning file & extracting devotional elements...</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-12 h-12 bg-teal-brand/10 text-teal-brand rounded-2xl flex items-center justify-center mx-auto transition-transform group-hover:scale-105">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Drag and drop your devotional document here
                  </p>
                  <p className="text-[10px] text-slate-400">
                    or click to browse your local computer (.docx format only)
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 py-1 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-[9px] font-mono font-bold text-slate-500">
                  <FileText className="w-3.5 h-3.5" />
                  june_2026_articles.docx
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-semibold flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Standard formatting rules card */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? "bg-slate-900/40 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"} text-[11px] space-y-2`}>
            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 uppercase tracking-wider text-[10px]">
              <Info className="w-3.5 h-3.5 text-teal-brand" />
              Format Guidelines for best results
            </h4>
            <ul className="list-disc pl-4 space-y-1">
              <li>Each day must start with a date header e.g. <strong className="text-teal-brand">June 1</strong> or <strong className="text-teal-brand">Monday, June 01</strong>.</li>
              <li>The line immediately following the date is parsed as the <strong className="text-slate-700 dark:text-slate-300">Title</strong>.</li>
              <li>The line following the title is parsed as <strong className="text-slate-700 dark:text-slate-300">Anchor Scripture</strong>. Best with en-dash e.g., <span className="italic">My Scripture Passage – Psalm 23:1 (NKJV)</span>.</li>
              <li>Include labels: <strong className="text-slate-700 dark:text-slate-300">Additional Scripture Reference(s):</strong>, <strong className="text-slate-700 dark:text-slate-300">Prayer and Confession of Faith:</strong>, and <strong className="text-slate-700 dark:text-slate-300">Daily Bible Reading:</strong> on their own lines.</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANEL: PARSED LIST OF DAYS (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Parsed Devotionals ({parsedList.length} Days)
              </span>
              <button
                type="button"
                onClick={handleAddNewDraftDay}
                className="py-1 px-2.5 bg-teal-brand/10 hover:bg-teal-brand hover:text-white text-teal-brand rounded-lg text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all"
              >
                <Plus className="w-3 h-3" /> Add Day
              </button>
            </div>

            <div className="space-y-1.5 max-h-[620px] overflow-y-auto pr-1">
              {parsedList.map((dev, idx) => {
                const isSelected = selectedIndex === idx;
                const hasDuplicateDate = existingDevotionals.some(e => e.date === dev.date && e.year === dev.year);
                
                return (
                  <div
                    key={`draft-${idx}`}
                    onClick={() => setSelectedIndex(idx)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between group ${
                      isSelected
                        ? "bg-teal-brand text-white border-teal-brand shadow-sm"
                        : isDarkMode
                          ? "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-100"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-900"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex flex-col items-center justify-center font-mono text-[9px] font-black shrink-0 ${
                        isSelected 
                          ? "bg-white/20 text-white" 
                          : isDarkMode 
                            ? "bg-slate-950 text-slate-300" 
                            : "bg-slate-100 text-slate-600"
                      }`}>
                        <span className="text-[10px] leading-none">{dev.date.split(" ")[1]}</span>
                        <span className="text-[7px] leading-none uppercase">{dev.date.split(" ")[0].substring(0, 3)}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold truncate pr-2">{dev.title}</h4>
                        <p className={`text-[9px] truncate ${isSelected ? "text-white/80" : "text-slate-400"}`}>
                          {dev.scriptureRef} · {dev.year}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasDuplicateDate && (
                        <span 
                          className="text-[8px] bg-amber-500/20 text-amber-500 dark:text-amber-400 border border-amber-500/10 px-1 py-0.5 rounded font-black uppercase tracking-wide"
                          title="This day already exists and will be overwritten!"
                        >
                          Overwrites
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDraft(idx);
                        }}
                        className={`p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                          isSelected 
                            ? "hover:bg-white/10 text-white/80 hover:text-white" 
                            : "hover:bg-rose-500/10 text-slate-400 hover:text-rose-500"
                        }`}
                        title="Remove Day"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bulk Actions Box */}
            <div className={`p-4 rounded-2xl border space-y-3.5 ${
              isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
            }`}>
              {duplicateCount > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[10px] leading-relaxed text-amber-600 dark:text-amber-400 font-semibold flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Warning: <strong>{duplicateCount}</strong> devotionals have matching dates/years in the database. Saving will overwrite the old devotionals for those days.
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSaveAll}
                  className="w-full py-2.5 px-4 bg-teal-brand text-white rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Save className="w-4 h-4" /> Save & Import {parsedList.length} Days
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Are you sure you want to discard your parsed draft devotionals?")) {
                      setParsedList([]);
                    }
                  }}
                  className="w-full py-2 px-4 bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-[0.98] transition-all"
                >
                  Clear and Start Over
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: EDIT DETAILED DAY FIELDS (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-4">
            {selectedIndex !== null && parsedList[selectedIndex] ? (
              <div className={`p-6 rounded-2xl border shadow-sm space-y-4 ${
                isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
              }`}>
                <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="py-1 px-2.5 bg-teal-brand/10 text-teal-brand text-[10px] font-black uppercase tracking-wider rounded-lg">
                      Reviewing Day {selectedIndex + 1}
                    </span>
                    <h2 className="font-serif text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">
                      Edit Parsed Content
                    </h2>
                  </div>

                  {/* Back/Next reviews */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={selectedIndex === 0}
                      onClick={() => setSelectedIndex(selectedIndex - 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-500"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-mono font-bold px-1.5 text-slate-400">
                      {selectedIndex + 1} / {parsedList.length}
                    </span>
                    <button
                      type="button"
                      disabled={selectedIndex === parsedList.length - 1}
                      onClick={() => setSelectedIndex(selectedIndex + 1)}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 disabled:opacity-40 text-slate-500"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold">
                  
                  {/* Date Field */}
                  <div className="space-y-1">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">* Devotional Date</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].date}
                      onChange={(e) => handleUpdateDraftField("date", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                      placeholder="e.g. June 01"
                    />
                  </div>

                  {/* Year Field */}
                  <div className="space-y-1">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">* Devotional Year</label>
                    <input
                      type="number"
                      value={parsedList[selectedIndex].year}
                      onChange={(e) => handleUpdateDraftField("year", parseInt(e.target.value, 10) || selectedYear)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Title Field */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">* Title</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].title}
                      onChange={(e) => handleUpdateDraftField("title", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900 font-bold"
                      }`}
                    />
                  </div>

                  {/* Scripture Reference Field */}
                  <div className="space-y-1">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Scripture Reference</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].scriptureRef}
                      onChange={(e) => handleUpdateDraftField("scriptureRef", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                      placeholder="e.g. Psalm 112:7 (NKJV)"
                    />
                  </div>

                  {/* Author Field */}
                  <div className="space-y-1">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Author</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].author}
                      onChange={(e) => handleUpdateDraftField("author", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Scripture Passage text field */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Scripture Passage Text</label>
                    <textarea
                      rows={2}
                      value={parsedList[selectedIndex].scriptureText}
                      onChange={(e) => handleUpdateDraftField("scriptureText", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Body Paragraphs Fields with individual controls */}
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex justify-between items-center">
                      <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">* Devotional paragraphs ({parsedList[selectedIndex].paragraphs.length})</label>
                      <button
                        type="button"
                        onClick={handleAddParagraphToDraft}
                        className="text-[9px] font-bold text-teal-brand uppercase tracking-wider flex items-center gap-0.5 hover:underline"
                      >
                        <Plus className="w-3 h-3" /> Add Paragraph
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
                      {parsedList[selectedIndex].paragraphs.map((p, pIdx) => (
                        <div key={`p-${pIdx}`} className="flex gap-2 items-start">
                          <span className="w-5 h-5 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono text-[10px] text-slate-400 shrink-0 mt-2">
                            {pIdx + 1}
                          </span>
                          <textarea
                            rows={3}
                            value={p}
                            onChange={(e) => handleUpdateDraftParagraph(pIdx, e.target.value)}
                            placeholder="Write paragraph text here..."
                            className={`w-full py-1.5 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveParagraphFromDraft(pIdx)}
                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded mt-2 shrink-0"
                            title="Remove paragraph"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Additional Scripture Reference */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Additional Scripture References</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].additionalScripture}
                      onChange={(e) => handleUpdateDraftField("additionalScripture", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                      placeholder="e.g. John 16:33, Colossians 1:2"
                    />
                  </div>

                  {/* Prayer & Confession */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Prayer and Confession of Faith</label>
                    <textarea
                      rows={3}
                      value={parsedList[selectedIndex].prayerConfession}
                      onChange={(e) => handleUpdateDraftField("prayerConfession", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                    />
                  </div>

                  {/* Daily Bible Reading */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase tracking-wider font-bold">Daily Bible Reading</label>
                    <input
                      type="text"
                      value={parsedList[selectedIndex].bibleReading}
                      onChange={(e) => handleUpdateDraftField("bibleReading", e.target.value)}
                      className={`w-full py-2 px-3 border rounded-xl focus:outline-none focus:border-black dark:focus:border-white ${
                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      }`}
                      placeholder="e.g. 2 Chronicles 16-18, John 17"
                    />
                  </div>

                </div>
              </div>
            ) : (
              <div className="h-96 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400">
                <BookOpen className="w-10 h-10 mb-2 animate-bounce" />
                <p className="text-xs font-bold">Select a parsed day to edit or review</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* ── Processing Overlay — shown while the bulk import is being saved ── */}
      {isSaving && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-sm w-full rounded-2xl border shadow-2xl p-8 text-center space-y-5 ${
            isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-teal-brand/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-teal-brand animate-spin" />
              <Save className="absolute inset-0 m-auto w-6 h-6 text-teal-brand" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-serif text-lg font-black uppercase tracking-tight">
                Please Wait — Processing…
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                Saving <strong className="text-teal-brand">{parsedList.length} devotionals</strong> to the database. This may take a few moments — do not close or refresh this page.
              </p>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-brand animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-2 h-2 rounded-full bg-teal-brand animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-2 h-2 rounded-full bg-teal-brand animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
