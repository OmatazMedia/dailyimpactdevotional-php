import React, { useState, useEffect } from "react";
import { Sun, Moon, Monitor, Menu, X, Heart } from "lucide-react";

interface NavbarProps {
  activeTab: "devotional" | "list" | "dashboard" | "foreword" | "author";
  setActiveTab: (tab: "devotional" | "list" | "dashboard" | "foreword" | "author") => void;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onOpenDonate: () => void;
}

export default function Navbar({
  activeTab,
  setActiveTab,
  isDarkMode,
  setIsDarkMode,
  onOpenDonate,
}: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "auto">("auto");
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

  const themeOptions: { mode: "light" | "dark" | "auto"; Icon: React.ElementType; tooltip: string }[] = [
    { mode: "light", Icon: Sun, tooltip: "Light" },
    { mode: "dark", Icon: Moon, tooltip: "Dark" },
    { mode: "auto", Icon: Monitor, tooltip: "Auto (follows device)" },
  ];

  const selectTheme = (mode: "light" | "dark" | "auto") => {
    setThemeMode(mode);
    setThemeDropdownOpen(false);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const nextDark = mode === "dark" ? true : mode === "light" ? false : prefersDark;
    setIsDarkMode(nextDark);
  };

  const ActiveIcon = themeOptions.find(o => o.mode === themeMode)!.Icon;

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsScrolled(scrollY > 10);
      const maxScrollDistance = 150;
      const ratio = Math.min(scrollY / maxScrollDistance, 1);
      setScrollRatio(ratio);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!themeDropdownOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#theme-dropdown-wrapper")) setThemeDropdownOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [themeDropdownOpen]);

  const navItems = [
    { id: "devotional", label: "HOME" },
    { id: "list", label: "ALL DEVOTIONALS" },
    { id: "foreword", label: "FOREWORD" },
  ] as const;

  return (
    <div
      id="main-navbar-sticky-wrapper"
      className="sticky top-0 z-50 w-full flex items-center justify-center h-20 bg-transparent"
    >
      <nav
        id="main-navbar"
        className={`transition-colors duration-300 flex items-center justify-between backdrop-blur-md border ${
          scrollRatio === 0
            ? "border-b border-transparent border-b-slate-200/50 dark:border-b-slate-800/80 rounded-none"
            : "border-slate-200 dark:border-slate-800"
        } ${
          scrollRatio === 0 ? "px-6 md:px-12" : "px-5 md:px-8"
        } ${
          isDarkMode
            ? "bg-slate-900/80 text-slate-100"
            : "bg-white/80 text-slate-800"
        }`}
        style={{
          width: `${100 - scrollRatio * 8}%`,
          maxWidth: scrollRatio === 0 ? "100%" : `${1162 - scrollRatio * 48}px`,
          borderRadius: `${scrollRatio * 24}px`,
          height: `${80 - scrollRatio * 16}px`,
          marginTop: `${scrollRatio * 16}px`,
          boxShadow: scrollRatio > 0 
            ? `0 10px 25px -5px rgba(0, 0, 0, ${scrollRatio * 0.05}), 0 8px 10px -6px rgba(0, 0, 0, ${scrollRatio * 0.05})` 
            : "none",
          transition: "width 0.1s ease-out, max-width 0.1s ease-out, border-radius 0.1s ease-out, height 0.1s ease-out, margin-top 0.1s ease-out, padding 0.1s ease-out, box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease",
        }}
      >
        <div className="flex justify-between items-center w-full h-full">
          
          {/* Logo Section */}
          <div
            id="app-logo"
            className="flex items-center gap-3 cursor-pointer shrink-0"
            onClick={() => setActiveTab("devotional")}
          >
            {/* Elegant Image logo from user URL */}
            <div className="p-1 rounded-xl bg-white/10 dark:bg-white/95 transition-all duration-300">
              <img
                src="/assets/images/dailyimpact.png"
                alt="Daily Impact Devotional"
                className="h-9 md:h-11 w-auto object-contain transition-all"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div id="desktop-nav-items" className="hidden md:flex items-center gap-6 lg:gap-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={`text-xs font-bold tracking-wider relative py-2 transition-all shrink-0 ${
                  activeTab === item.id
                    ? "text-teal-brand font-extrabold"
                    : isDarkMode
                    ? "text-slate-300 hover:text-white"
                    : "text-slate-600 hover:text-slate-950"
                }`}
              >
                {item.label}
                {activeTab === item.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-teal-brand rounded-full animate-pulse" />
                )}
              </button>
            ))}
          </div>

          {/* Right Controls: Theme Toggle & Donate */}
          <div id="nav-controls" className="hidden md:flex items-center gap-3 lg:gap-4 shrink-0">
            
            {/* Theme Dropdown */}
            <div id="theme-dropdown-wrapper" className="relative">
              <button
                id="theme-toggle-btn"
                onClick={() => setThemeDropdownOpen(prev => !prev)}
                className={`p-2 rounded-xl border transition-all ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700 hover:border-slate-600"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300"
                }`}
              >
                <ActiveIcon className="w-4 h-4" />
              </button>

              {themeDropdownOpen && (
                <div className={`absolute right-0 mt-2 p-1.5 rounded-2xl border shadow-xl backdrop-blur-md flex flex-col gap-1 z-50 ${
                  isDarkMode
                    ? "bg-slate-900/90 border-slate-700"
                    : "bg-white/90 border-slate-200"
                }`}>
                  {themeOptions.map(({ mode, Icon, tooltip }) => (
                    <div key={mode} className="relative group">
                      <button
                        onClick={() => selectTheme(mode)}
                        className={`p-2 rounded-xl transition-all ${
                          themeMode === mode
                            ? isDarkMode
                              ? "bg-slate-700 text-amber-400"
                              : "bg-slate-100 text-teal-brand"
                            : isDarkMode
                            ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                      {/* Tooltip */}
                      <div className={`absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
                        isDarkMode ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-white"
                      }`}>
                        {tooltip}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Donate Button */}
            <button
              id="navbar-donate-btn"
              onClick={onOpenDonate}
              className="px-4 py-2 bg-teal-brand hover:bg-teal-brand/90 active:scale-[0.98] text-white font-bold text-xs tracking-widest rounded-lg shadow-sm transition-all flex items-center gap-1.5 uppercase shrink-0"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              Donate
            </button>
          </div>

          {/* Mobile Right Controls & Menu Icon */}
          <div className="flex items-center gap-2 md:hidden shrink-0">
            {/* Mobile Theme Dropdown */}
            <div id="theme-dropdown-wrapper" className="relative">
              <button
                onClick={() => setThemeDropdownOpen(prev => !prev)}
                className={`p-1.5 rounded-lg border ${
                  isDarkMode
                    ? "bg-slate-800 border-slate-700 text-amber-400"
                    : "bg-slate-50 border-slate-200 text-slate-600"
                }`}
              >
                <ActiveIcon className="w-4 h-4" />
              </button>

              {themeDropdownOpen && (
                <div className={`absolute right-0 mt-2 p-1.5 rounded-2xl border shadow-xl backdrop-blur-md flex flex-col gap-1 z-50 ${
                  isDarkMode
                    ? "bg-slate-900/90 border-slate-700"
                    : "bg-white/90 border-slate-200"
                }`}>
                  {themeOptions.map(({ mode, Icon, tooltip }) => (
                    <div key={mode} className="relative group">
                      <button
                        onClick={() => selectTheme(mode)}
                        className={`p-2 rounded-xl transition-all ${
                          themeMode === mode
                            ? isDarkMode
                              ? "bg-slate-700 text-amber-400"
                              : "bg-slate-100 text-teal-brand"
                            : isDarkMode
                            ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </button>
                      {/* Tooltip */}
                      <div className={`absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
                        isDarkMode ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-white"
                      }`}>
                        {tooltip}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hamburger Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`p-1.5 rounded-lg border ${
                isDarkMode
                  ? "bg-slate-800 border-slate-700 text-slate-300"
                  : "bg-slate-50 border-slate-200 text-slate-600"
              }`}
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>

        </div>

        {/* Mobile Drawer Navigation */}
        {isMobileMenuOpen && (
          <div
            id="mobile-menu-drawer"
            className={`absolute top-full left-0 right-0 mt-2 p-4 rounded-2xl shadow-xl border md:hidden space-y-3 z-50 ${
              isDarkMode
                ? "bg-slate-900/95 border-slate-800 text-slate-100"
                : "bg-white/95 border-slate-200 text-slate-800"
            } backdrop-blur-lg animate-in fade-in slide-in-from-top-3 duration-300`}
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full text-left py-2 px-4 rounded-xl text-xs font-bold tracking-widest transition-all ${
                  activeTab === item.id
                    ? "bg-teal-brand/10 text-teal-brand font-black"
                    : isDarkMode
                    ? "text-slate-300 hover:bg-slate-800/50 hover:text-white"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                onOpenDonate();
              }}
              className="w-full py-2.5 bg-teal-brand text-white font-bold text-xs tracking-widest rounded-xl shadow-sm transition-all flex items-center justify-center gap-1.5 uppercase"
            >
              <Heart className="w-4 h-4 fill-current" />
              Donate
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
