import React, { useState, useEffect, useRef } from "react";
import { Devotional } from "../types";
import { API_BASE } from "../config/api";
import { 
  Bookmark, 
  Search, 
  Calendar, 
  BookOpen, 
  ChevronRight, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Info 
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DevotionalListProps {
  devotionals: Devotional[];
  onSelectDevotional: (devotional: Devotional) => void;
  isDarkMode: boolean;
}

const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

const CURRENT_YEAR = new Date().getFullYear();
const OUTSIDE_YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];
const DROPDOWN_YEARS = Array.from({ length: CURRENT_YEAR - 3 - 2010 + 1 }, (_, i) => CURRENT_YEAR - 3 - i);

export default function DevotionalList({
  devotionals,
  onSelectDevotional,
  isDarkMode
}: DevotionalListProps) {
  const [adminTimezone, setAdminTimezone] = useState("Africa/Lagos");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data?.admin_timezone) setAdminTimezone(data.admin_timezone);
      })
      .catch(() => {});
  }, []);

  // Get current Lagos time for defaults
  const getLagosDateParts = () => {
    try {
      const month = new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, month: 'long' }).format(new Date());
      const year = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: adminTimezone, year: 'numeric' }).format(new Date()), 10);
      return { month: month.toUpperCase(), year };
    } catch {
      return { month: "JULY", year: new Date().getFullYear() };
    }
  };

  const { month: currentLagosMonth, year: currentLagosYear } = getLagosDateParts();

  const [selectedYear, setSelectedYear] = useState<number>(currentLagosYear);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentLagosMonth);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState<boolean>(false);
  const [noDevotionalModalOpen, setNoDevotionalModalOpen] = useState<boolean>(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close year dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsYearDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter devotionals based on selected year, month, and search query
  const filteredDevotionals = devotionals.filter((dev) => {
    const matchesYear = dev.year === selectedYear;
    const matchesMonth = dev.date.toLowerCase().startsWith(selectedMonth.toLowerCase());
    const matchesSearch = searchQuery
      ? dev.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.scriptureRef.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev.paragraphs.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()))
      : true;

    return matchesYear && matchesMonth && matchesSearch;
  });

  const handleYearSelect = (yr: number) => {
    setSelectedYear(yr);
    setIsYearDropdownOpen(false);
    
    // Check if the newly selected combination will be empty
    const count = devotionals.filter((dev) => {
      const matchesYear = dev.year === yr;
      const matchesMonth = dev.date.toLowerCase().startsWith(selectedMonth.toLowerCase());
      return matchesYear && matchesMonth;
    }).length;

    if (count === 0) {
      setNoDevotionalModalOpen(true);
    }
  };

  const handleMonthSelect = (month: string) => {
    setSelectedMonth(month);
    setSearchQuery("");
    
    // Check if the newly selected combination will be empty
    const count = devotionals.filter((dev) => {
      const matchesYear = dev.year === selectedYear;
      const matchesMonth = dev.date.toLowerCase().startsWith(month.toLowerCase());
      return matchesYear && matchesMonth;
    }).length;

    if (count === 0) {
      setNoDevotionalModalOpen(true);
    }
  };

  const isDropdownYearSelected = DROPDOWN_YEARS.includes(selectedYear);

  return (
    <div id="devotional-list-container" className="space-y-12">
      
      {/* 1. Year Filter Selection - Centered at the top */}
      <div className="flex flex-col items-center justify-center space-y-4">
        <span className="text-xs uppercase tracking-widest font-black text-slate-600 dark:text-slate-400">
          Select Year
        </span>
        <div className="flex flex-wrap items-center justify-center gap-2 bg-slate-100/70 dark:bg-slate-900/60 p-1.5 rounded-2xl md:rounded-full border border-slate-200 dark:border-slate-800/40 shadow-inner">
          {OUTSIDE_YEARS.map((yr) => (
            <button
              key={yr}
              onClick={() => handleYearSelect(yr)}
              className={`px-5 py-2 text-xs font-black tracking-wider rounded-full transition-all duration-300 ${
                selectedYear === yr && !isDropdownYearSelected
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-md"
                  : "text-slate-700 dark:text-slate-400 hover:text-black dark:hover:text-white"
              }`}
            >
              {yr}
            </button>
          ))}

          {/* More Year Selection Dropdown Wrapper */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
              className={`px-5 py-2 text-xs font-black tracking-wider rounded-full transition-all duration-300 flex items-center gap-1.5 ${
                isDropdownYearSelected
                  ? "bg-black text-white dark:bg-white dark:text-black shadow-md"
                  : "text-slate-700 dark:text-slate-400 hover:text-black dark:hover:text-white"
              }`}
            >
              {isDropdownYearSelected ? `More (${selectedYear})` : "More"}
              {isYearDropdownOpen ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Dropdown Items List */}
            <AnimatePresence>
              {isYearDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={`absolute right-0 mt-2 w-48 rounded-xl border shadow-2xl z-50 max-h-60 overflow-y-auto ${
                    isDarkMode
                      ? "bg-slate-950 border-slate-800 text-white"
                      : "bg-white border-slate-200 text-slate-950"
                  }`}
                >
                  <div className="p-1.5 space-y-1">
                    {DROPDOWN_YEARS.map((yr) => (
                      <button
                        key={yr}
                        onClick={() => handleYearSelect(yr)}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold rounded-lg transition-colors ${
                          selectedYear === yr
                            ? "bg-black text-white dark:bg-white dark:text-black"
                            : isDarkMode
                            ? "hover:bg-slate-900 text-slate-300"
                            : "hover:bg-slate-100 text-slate-950"
                        }`}
                      >
                        {yr}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* 2. Devotional By Month Container */}
      <div 
        className={`rounded-3xl p-6 sm:p-10 border transition-all duration-500 ${
          isDarkMode
            ? "bg-slate-950 border-slate-900 shadow-2xl shadow-black/30"
            : "bg-white border-slate-200 shadow-2xl shadow-slate-200/50"
        }`}
      >
        {/* Section Header with Red Bookmark Icon */}
        <div className="flex items-center gap-2 mb-8 border-b border-slate-100 dark:border-slate-900 pb-4">
          <Bookmark className="w-5 h-5 text-red-600 fill-red-600 shrink-0" />
          <h2 className="font-serif text-xl sm:text-2xl font-black uppercase tracking-wider text-black dark:text-white">
            Devotional By Month
          </h2>
        </div>

        {/* Month grid - 2 columns */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
          {MONTHS.map((month) => {
            const isActive = selectedMonth === month;
            return (
              <button
                key={month}
                onClick={() => handleMonthSelect(month)}
                className={`py-4 px-6 text-xs font-bold uppercase tracking-widest rounded-xl border text-center transition-all duration-300 ${
                  isActive
                    ? "bg-black text-white border-black dark:bg-white dark:text-black dark:border-white shadow-lg"
                    : isDarkMode
                    ? "bg-slate-900/40 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                    : "bg-white border-slate-200 text-slate-700 hover:border-black hover:bg-slate-50 font-black"
                }`}
              >
                {month}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Devotionals under selected month list */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-900 pb-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-black dark:text-white">
              Readings for {selectedMonth} {selectedYear}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
              Select any of the {filteredDevotionals.length} daily devotionals to view and listen to the broadcast.
            </p>
          </div>

          {/* Search bar inside selected month */}
          {filteredDevotionals.length > 0 || searchQuery ? (
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-slate-400" />
              <input
                type="text"
                placeholder="Search this month..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full py-2.5 pl-9 pr-4 text-xs rounded-xl focus:outline-none focus:border-black dark:focus:border-white border ${
                  isDarkMode
                    ? "bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500"
                    : "bg-white border-slate-200 text-slate-800 placeholder:text-slate-500 font-bold"
                }`}
              />
            </div>
          ) : null}
        </div>

        {/* Display filtered devotionals list */}
        {filteredDevotionals.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDevotionals.map((dev) => (
              <div
                key={dev.id}
                onClick={() => onSelectDevotional(dev)}
                className={`group p-4 rounded-xl border transition-all duration-300 cursor-pointer flex flex-col justify-between ${
                  isDarkMode
                    ? "bg-slate-900/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80 text-slate-100"
                    : "bg-white border-slate-200 hover:border-black hover:shadow-md hover:scale-[1.01] text-slate-950"
                }`}
              >
                <div className="space-y-1">
                  <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 flex items-center gap-1.5 uppercase">
                    <Calendar className="w-3.5 h-3.5" />
                    {dev.date}
                  </div>
                  <h4 className="font-serif text-sm font-black group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors text-black dark:text-white leading-snug break-words">
                    {dev.title}
                  </h4>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/20 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800/50">
            <p className="text-slate-600 dark:text-slate-400 text-sm italic font-black">
              No devotionals published for {selectedMonth} {selectedYear} yet.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-bold">
              The publisher has not uploaded devotionals for this period. Check back soon.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => {
                  setSelectedMonth(currentLagosMonth);
                  setSelectedYear(currentLagosYear);
                }}
                className="px-4 py-2 text-xs font-black bg-black text-white dark:bg-white dark:text-black rounded-lg transition-all"
              >
                Go to Current Month
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Beautiful automated Modal when no devotional was posted for selected Month/Year */}
      <AnimatePresence>
        {noDevotionalModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNoDevotionalModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 350 }}
              className={`relative w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-2xl border text-center ${
                isDarkMode
                  ? "bg-slate-900 border-slate-800 text-white"
                  : "bg-white border-slate-200 text-slate-950"
              }`}
            >
              {/* Close Button */}
              <button
                onClick={() => setNoDevotionalModalOpen(false)}
                className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${
                  isDarkMode ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-black"
                }`}
              >
                <X className="w-5 h-5" />
              </button>

              {/* Icon */}
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-6 text-amber-500">
                <Info className="w-8 h-8" />
              </div>

              {/* Title & Date */}
              <h3 className="font-serif text-2xl font-black mb-2 tracking-tight">
                No Devotional Posted
              </h3>
              <p className="text-xs uppercase tracking-widest font-black text-amber-500 mb-4">
                {selectedMonth} {selectedYear}
              </p>

              {/* Description */}
              <p className={`text-xs md:text-sm leading-relaxed mb-8 ${
                isDarkMode ? "text-slate-300" : "text-slate-700 font-medium"
              }`}>
                Dr. Andy Osakwe regularly publishes Daily Impact Devotionals to enrich your spiritual growth. 
                However, there are no devotional records in our archive for this selected date combination yet.
              </p>

              {/* Action Choices */}
              <div className="space-y-3">
                <button
                  onClick={() => {
                    setSelectedMonth(currentLagosMonth);
                    setSelectedYear(currentLagosYear);
                    setNoDevotionalModalOpen(false);
                  }}
                  className="w-full py-3.5 bg-black text-white dark:bg-white dark:text-black font-black text-xs tracking-widest rounded-xl hover:opacity-90 active:scale-[0.98] transition-all uppercase shadow-lg shadow-black/10"
                >
                  Go to Current Month ({currentLagosMonth.charAt(0) + currentLagosMonth.slice(1).toLowerCase()} {currentLagosYear})
                </button>

                <button
                  onClick={() => setNoDevotionalModalOpen(false)}
                  className={`w-full py-2.5 font-bold text-xs transition-colors rounded-xl ${
                    isDarkMode ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-black"
                  }`}
                >
                  Dismiss & Select Another Date
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
