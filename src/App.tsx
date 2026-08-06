import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import DevotionalView from "./components/DevotionalView";
import DevotionalSkeleton from "./components/DevotionalSkeleton";
import HeroSkeleton from "./components/HeroSkeleton";
import Sidebar from "./components/Sidebar";
import DevotionalList from "./components/DevotionalList";
import AddDevotional from "./components/AddDevotional";
import ListDevotional from "./components/ListDevotional";
import Login from "./components/Login";
import DonateModal from "./components/DonateModal";
import DonationThanks from "./components/DonationThanks";
import Footer from "./components/Footer";
import Dashboard from "./components/Dashboard";
import ForewordView from "./components/ForewordView";
import AuthorPage from "./components/AuthorPage";
import PwaSplash from "./components/PwaSplash";
import InstallPrompt from "./components/InstallPrompt";
import { getDevotionalsAsync, saveDevotionalAsync, updateDevotionalAsync, saveMultipleDevotionalsAsync } from "./devotionalsData";
import { Devotional, ForewordPost } from "./types";
import { API_BASE } from "./config/api";
import { buildHeaderMap, HeaderMappingRow } from "./lib/headers";
import { initAnalytics } from "./lib/analytics";
import { slugForDevotional, findDevotionalBySlug } from "./lib/devotionalSlug";

// Helper to parse date Str and year to local Date object
export const getDevotionalDateValue = (dateStr: string, year: number): Date => {
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

// Helper to get date parts in Admin Timezone
export const getAdminTimezoneDate = (timezone: string) => {
  try {
    const d = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
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

// Helper to select devotional for EXACT today's date only (no fallback to past)
export const getDevotionalForDate = (list: Devotional[], timezone: string): Devotional | null => {
  if (list.length === 0) return null;

  const { year, month, day } = getAdminTimezoneDate(timezone);
  const targetMonthLower = month.toLowerCase();

  const normalizeDateParts = (dateStr: string) => {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    let m = "";
    let d = 0;
    const clean = dateStr.trim();
    const matchMD = clean.match(/^([A-Za-z]+)\s+(\d+)/i);
    if (matchMD) {
      m = matchMD[1];
      d = parseInt(matchMD[2], 10);
    } else {
      const matchDM = clean.match(/^(\d+)\s+([A-Za-z]+)/i);
      if (matchDM) {
        d = parseInt(matchDM[1], 10);
        m = matchDM[2];
      }
    }
    if (!m) {
      for (const monthWord of months) {
        if (clean.toLowerCase().includes(monthWord.toLowerCase())) {
          m = monthWord;
          break;
        }
      }
      const numMatch = clean.match(/\d+/);
      if (numMatch) d = parseInt(numMatch[0], 10);
    }
    return { month: m.toLowerCase(), day: d };
  };

  // Find exact day & month & year match first
  const exactMatch = list.find(dev => {
    const { month: devMonth, day: devDay } = normalizeDateParts(dev.date);
    return devMonth === targetMonthLower && devDay === day && dev.year === year;
  });

  if (exactMatch) return exactMatch;

  // Relaxation: match day & month of any year (same day published in a previous year)
  const monthDayMatch = list.find(dev => {
    const { month: devMonth, day: devDay } = normalizeDateParts(dev.date);
    return devMonth === targetMonthLower && devDay === day;
  });

  if (monthDayMatch) return monthDayMatch;

  // No devotional for today — return null so the homepage shows the "no devotional" message
  return null;
};

// Format a day number with ordinal suffix: 1st, 2nd, 3rd, 20th etc.
export const getOrdinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// Format full Lagos date string: "20th July 2026, 11:25 AM"
export const getLagosFormattedDateTime = (timezone: string): string => {
  try {
    const now = new Date();
    const dayNum = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: timezone, day: 'numeric' }).format(now), 10);
    const month = new Intl.DateTimeFormat('en-US', { timeZone: timezone, month: 'long' }).format(now);
    const year = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric' }).format(now);
    const time = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
    return `${getOrdinal(dayNum)} ${month} ${year}, ${time}`;
  } catch {
    return new Date().toLocaleString();
  }
};

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Active Administrator Session State — check PHP session on mount
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    // Record a public website visit (skipped inside the admin dashboard area).
    initAnalytics(
      location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/admin")
    );
    fetch(`${API_BASE}/admin.php?action=check`)
      .then(r => r.json())
      .then(data => {
        if (data.loggedIn && data.user) {
          setCurrentUser(data.user.email);
        }
      })
      .catch(() => {});
  }, []);

  // Sync activeTab with URL pathname
  const getActiveTabFromPath = (pathname: string): "devotional" | "list" | "dashboard" | "login" | "foreword" | "author" => {
    if (pathname.startsWith("/all-devotional")) return "list";
    if (pathname.startsWith("/dashboard")) return "dashboard";
    if (pathname.startsWith("/admin/login") || pathname.startsWith("/admin")) return "login";
    if (pathname.startsWith("/foreword")) return "foreword";
    if (pathname.startsWith("/author")) return "author";
    return "devotional";
  };

  const activeTab = getActiveTabFromPath(location.pathname);

  const setActiveTab = (tab: "devotional" | "list" | "dashboard" | "login" | "foreword" | "author") => {
    if (tab === "devotional") navigate("/");
    else if (tab === "list") navigate("/all-devotional");
    else if (tab === "foreword") navigate("/foreword");
    else if (tab === "author") navigate("/author");
    else if (tab === "dashboard") {
      if (currentUser) navigate("/dashboard");
      else navigate("/admin/login");
    } else if (tab === "login") navigate("/admin/login");
  };

  // Redirection checks for authenticated vs unauthenticated paths
  useEffect(() => {
    const path = location.pathname;
    const knownRoutes = ["/", "/all-devotional", "/foreword", "/author", "/dashboard", "/admin/login"];
    const isKnown = knownRoutes.some(r => path === r || path.startsWith(r + "/"));

    if (path === "/home" || path === "/login") {
      navigate("/", { replace: true });
    } else if (path.startsWith("/admin") && path !== "/admin/login") {
      // Any /admin/* that is not exactly /admin/login → homepage
      navigate("/", { replace: true });
    } else if (path.startsWith("/dashboard") && !currentUser) {
      navigate("/", { replace: true });
    } else if (path === "/admin/login" && currentUser) {
      navigate("/dashboard", { replace: true });
    } else if (!isKnown) {
      // Unknown route — redirect to homepage
      navigate("/", { replace: true });
    }
  }, [location.pathname, currentUser, navigate]);

  const [devotionals, setDevotionals] = useState<Devotional[]>([]);
  const [selectedDevotional, setSelectedDevotional] = useState<Devotional | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  // True while the homepage's first data load is still running, so we render a
  // loading skeleton instead of flashing the "No Devotional for Today" state.
  const [isLoading, setIsLoading] = useState(true);
  // Mapped header images (dateKey -> url) preloaded in parallel with the
  // devotional list so the correct banner shows on the very first paint.
  const [headerMap, setHeaderMap] = useState<Record<string, string>>({});
  // Custom hero banner URL (from settings) preloaded with the other data.
  const [homepageHeroImage, setHomepageHeroImage] = useState("");
  const [isDonateOpen, setIsDonateOpen] = useState<boolean>(false);
  // After a successful online donation, the public page is replaced by the
  // confetti thank-you screen (like a redirect to a celebration page).
  const [thanksInfo, setThanksInfo] = useState<{ name: string; amount: number; currency: string; anonymous: boolean } | null>(null);
  const [activeDateKey, setActiveDateKey] = useState<string>("");

  // Sort and set devotionals chronologically
  const sortDevotionals = (list: Devotional[]) => {
    return [...list].sort((a, b) => {
      return getDevotionalDateValue(a.date, a.year).getTime() - getDevotionalDateValue(b.date, b.year).getTime();
    });
  };

  const setSortedDevotionals = (list: Devotional[]) => {
    const sorted = sortDevotionals(list);
    setDevotionals(sorted);
    return sorted;
  };

  // Reconcile the list against the server in the background. Used after a
  // local instant-merge so ordering/ids converge without blocking the UI.
  // (Plain function — only invoked from event handlers, never from an effect,
  // so it doesn't need useCallback.)
  const refreshDevotionalsInBackground = () => {
    getDevotionalsAsync()
      .then(list => {
        if (list.length > 0) setSortedDevotionals(list);
      })
      .catch(() => {});
  };

  // Load devotionals with a short retry so a transient API hiccup (cold PHP,
  // slow first request) never leaves the admin dashboard stuck on an empty
  // list — rows may exist in the DB while the initial fetch returned [] once.
  const loadDevotionals = useCallback(async (): Promise<Devotional[]> => {
    let list: Devotional[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      list = await getDevotionalsAsync();
      if (list.length > 0) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 800));
    }
    const sortedList = setSortedDevotionals(list);
    return sortedList;
  }, []);

  // Initialize and load everything IN PARALLEL — devotionals, settings, and
  // mapped headers — so the homepage shows today's devotional and its correct
  // banner on the FIRST paint instead of flashing "No Devotional" + the
  // fallback image while several sequential round-trips complete.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [sortedList, settings, headerRows] = await Promise.all([
        loadDevotionals(),
        fetch(`${API_BASE}/settings.php`).then(r => r.ok ? r.json() : {} as Record<string, string>).catch(() => ({}) as Record<string, string>),
        fetch(`${API_BASE}/headers.php`).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      if (cancelled) return;

      const tz = String(settings.admin_timezone || "Africa/Lagos");
      setHeaderMap(buildHeaderMap(headerRows as HeaderMappingRow[]));
      setHomepageHeroImage(String(settings.homepage_hero_image || ""));

      const dObj = getAdminTimezoneDate(tz);
      const dKey = `${dObj.month} ${dObj.day}, ${dObj.year}`;
      setActiveDateKey(dKey);

      // Deep link: ?devotional=5-aug-2025 (date slug) or ?devotional=<uuid>
      // (legacy links) selects that specific devotional instead of today's.
      // Anything unrecognized falls back to today's devotional.
      let targetDev: Devotional | null = null;
      try {
        const q = new URLSearchParams(window.location.search);
        targetDev = findDevotionalBySlug(sortedList, q.get("devotional"));
      } catch { /* malformed query — fall through to today */ }
      if (!targetDev) targetDev = getDevotionalForDate(sortedList, tz);
      if (targetDev) setSelectedDevotional(targetDev);
    };
    // finally() always clears the loading state — on success AND on any
    // unexpected rejection — so the skeleton can never get stuck.
    load().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadDevotionals]);

  // Gateway return callback: after an online donation the donor is redirected
  // back to /?donation=<reference> (Paystack / Flutterwave). Verify the
  // transaction server-side and celebrate on success. The URL marker is
  // cleared afterwards so a refresh doesn't re-verify.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const donationRef = params.get("donation");
    if (!donationRef) return;

    const verify = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/donations.php?action=verify&reference=${encodeURIComponent(donationRef)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          status?: string;
          amount?: number;
          currency?: string;
          name?: string;
          is_anonymous?: number;
          error?: string;
        };
        if (cancelled) return;
        if (data.success && data.status === "success") {
          setThanksInfo({
            name: data.is_anonymous ? "" : (data.name || ""),
            amount: Number(data.amount || 0),
            currency: String(data.currency || ""),
            anonymous: !!data.is_anonymous,
          });
        } else if (data.status === "failed") {
          // Failed/cancelled at the gateway — quietly return to the homepage.
          alert("Your payment was not completed. No charge was made. Please try again.");
        } else if (data.status === "pending") {
          // Still pending at the gateway (async confirmation). Don't leave the
          // donor staring at a blank page — tell them what's happening.
          alert("Your payment is being confirmed. Once it is verified your receipt and thank-you page will appear. Thank you for your patience.");
        }
      } catch {
        // Network error during verification — stay on the page.
      } finally {
        // Clear the ?donation= marker so refresh/re-share shows a clean URL.
        if (!cancelled) {
          try {
            window.history.replaceState(null, "", window.location.pathname);
          } catch { /* ignore */ }
        }
      }
    };
    verify();
    return () => { cancelled = true; };
  }, []);

  // Poll for date change in Admin Timezone (Rollover at 12:00 AM)
  // When the date changes, re-fetch from API
  useEffect(() => {
    const interval = setInterval(async () => {
      let timezone = "Africa/Lagos";
      try {
        const settings = await fetch(`${API_BASE}/settings.php`).then(r => r.ok ? r.json() : {} as Record<string, string>);
        timezone = String(settings.admin_timezone || timezone);
      } catch {}
      const dObj = getAdminTimezoneDate(timezone);
      const dKey = `${dObj.month} ${dObj.day}, ${dObj.year}`;
      
      if (activeDateKey && dKey !== activeDateKey) {
        setActiveDateKey(dKey);
        // Fetch the fresh list AND refreshed header map together so the new
        // day's devotional and its banner appear at the same moment.
        const [list, headerRows] = await Promise.all([
          getDevotionalsAsync(),
          fetch(`${API_BASE}/headers.php`).then(r => r.ok ? r.json() : []).catch(() => []),
        ]);
        if (Array.isArray(headerRows)) setHeaderMap(buildHeaderMap(headerRows as HeaderMappingRow[]));
        if (list.length > 0) {
          const sortedList = setSortedDevotionals(list);
          const autoDev = getDevotionalForDate(sortedList, timezone);
          if (autoDev) setSelectedDevotional(autoDev);
        }
      }
    }, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [activeDateKey, devotionals]);

  // Sync dark class on <html> whenever isDarkMode changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  // Keep the browser tab + in-page social previews in sync with the open
  // devotional. Server-side crawlers (WhatsApp, Telegram, Facebook, Twitter)
  // get full OG tags from backend/api/og.php via the .htaccess rewrite; this
  // effect covers the SPA itself and any JS-based embed/in-app browsers.
  useEffect(() => {
    const setMeta = (prop: string, content: string) => {
      let el = document.head.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", prop);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    const setName = (name: string, content: string) => {
      let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    if (selectedDevotional) {
      const t = selectedDevotional.title;
      const desc = `${selectedDevotional.date}, ${selectedDevotional.year} — Read today's word on Daily Impact Devotional.`;
      document.title = `${t} — Daily Impact Devotional`;
      setMeta("og:title", t);
      setMeta("og:description", desc);
      setMeta("og:url", `${window.location.origin}?devotional=${slugForDevotional(selectedDevotional.date, selectedDevotional.year) || selectedDevotional.id}`);
      setName("twitter:title", t);
      setName("twitter:description", desc);
      // Always emit an absolute, existing image: the devotional's own image when
      // present, otherwise the bundled logo (ships on every install/domain).
      const logo = `${window.location.origin}/assets/images/dailyimpact.png`;
      const img = selectedDevotional.imageUrl
        ? (selectedDevotional.imageUrl.startsWith("http")
            ? selectedDevotional.imageUrl
            : `${window.location.origin}${selectedDevotional.imageUrl.startsWith("/") ? "" : "/"}${selectedDevotional.imageUrl}`)
        : logo;
      const isLogo = img === logo;
      setMeta("og:image", img);
      setMeta("og:image:secure_url", img);
      setMeta("og:image:type", isLogo ? "image/png" : "image/jpeg");
      setMeta("og:image:width", isLogo ? "512" : "1200");
      setMeta("og:image:height", isLogo ? "512" : "630");
      setName("twitter:image", img);
    } else {
      // Homepage — reset to the site defaults (logo OG image) so a stale
      // devotional image never lingers after navigating back home.
      const logo = `${window.location.origin}/assets/images/dailyimpact.png`;
      document.title = "Daily Impact Devotional | Dr. Andy Osakwe";
      setMeta("og:title", "Daily Impact Devotional | Dr. Andy Osakwe");
      setMeta("og:description", "Start every day with God's Word. Daily scripture readings, prayer confessions, and spirit-filled teachings by Dr. Andy Osakwe of Andrew Osakwe Ministries International.");
      setMeta("og:url", window.location.origin);
      setMeta("og:image", logo);
      setMeta("og:image:secure_url", logo);
      setMeta("og:image:type", "image/png");
      setMeta("og:image:width", "512");
      setMeta("og:image:height", "512");
      setName("twitter:title", "Daily Impact Devotional | Dr. Andy Osakwe");
      setName("twitter:description", "Start every day with God's Word. Daily scripture readings, prayer confessions, and spirit-filled teachings by Dr. Andy Osakwe.");
      setName("twitter:image", logo);
    }
  }, [selectedDevotional]);

  const handleToggleTheme = () => {
    setIsDarkMode(prev => !prev);
  };

  // Handle saving new devotional from publisher form.
  // Errors are RETHROWN so the Dashboard's try/catch toast can surface them,
  // and the list is only refreshed when the re-fetch actually returns data —
  // otherwise a transient API hiccup would wipe the admin list to [] while the
  // homepage still shows the just-saved devotional.
  const handleSaveNewDevotional = async (newDev: Omit<Devotional, "id">) => {
    try {
      const saved = await saveDevotionalAsync(newDev);
      // Merge the returned record into the list IMMEDIATELY — no full re-fetch
      // round-trip, so the admin list and homepage update the moment the save
      // completes instead of seconds later.
      setDevotionals(prev => sortDevotionals([...prev.filter(d => !(d.date === saved.date && d.year === saved.year)), saved]));
      setSelectedDevotional(saved);
      refreshDevotionalsInBackground();
    } catch (err) {
      console.error('Failed to save devotional:', err);
      throw err;
    }
  };

  // Handle saving multiple imported devotionals.
  // Errors are RETHROWN so the Dashboard's try/catch toast can surface them
  // (previously they were swallowed here, hiding DB failures behind fake success).
  const handleSaveMultipleDevotionals = async (newDevs: Omit<Devotional, "id">[]) => {
    try {
      // The bulk endpoint returns the saved records — merge them into the list
      // IMMEDIATELY (replacing rows for the same date/year) so the modal closes
      // and the admin list is already populated; no slow full re-fetch first.
      const savedList = await saveMultipleDevotionalsAsync(newDevs);
      const incoming = Array.isArray(savedList) ? savedList : [];
      if (incoming.length > 0) {
        setDevotionals(prev => {
          const incomingKeys = new Set(incoming.map(d => `${d.date}|${d.year}`));
          const kept = prev.filter(d => !incomingKeys.has(`${d.date}|${d.year}`));
          return sortDevotionals([...kept, ...incoming]);
        });
        if (newDevs.length > 0) {
          const match = incoming.find(d => d.date === newDevs[0].date && d.year === newDevs[0].year);
          if (match) setSelectedDevotional(match);
        }
      }
      refreshDevotionalsInBackground();
    } catch (err) {
      console.error('Failed to bulk import devotionals:', err);
      throw err;
    }
  };

  // Handle updating an existing devotional.
  // Errors are RETHROWN so the Dashboard's try/catch toast surfaces failures,
  // and the list is only refreshed when the re-fetch returns data.
  const handleUpdateDevotional = async (updatedDev: Devotional) => {
    try {
      await updateDevotionalAsync(updatedDev);
      // Reflect the edit locally immediately; reconcile in the background.
      setDevotionals(prev => sortDevotionals(prev.map(d => (d.id === updatedDev.id ? updatedDev : d))));
      if (selectedDevotional && selectedDevotional.id === updatedDev.id) {
        setSelectedDevotional(updatedDev);
      }
      refreshDevotionalsInBackground();
    } catch (err) {
      console.error('Failed to update devotional:', err);
      throw err;
    }
  };

  // Refresh the list after devotionals were deleted (the DELETEs themselves
  // run inside ListDevotional). An empty list IS legitimate here, so unlike
  // save/update we always reflect whatever the API returns.
  const handleDeleteDevotionals = async (ids: string[]) => {
    // Remove the deleted rows locally immediately; reconcile in background.
    setDevotionals(prev => sortDevotionals(prev.filter(d => !ids.includes(d.id))));
    setSelectedDevotional(prev => (prev && ids.includes(prev.id) ? null : prev));
    refreshDevotionalsInBackground();
  };

  // Find index and handle navigation
  const currentIndex = selectedDevotional
    ? devotionals.findIndex((d) => d.id === selectedDevotional.id)
    : -1;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex !== -1 && currentIndex < devotionals.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setSelectedDevotional(devotionals[currentIndex - 1]);
      window.scrollTo({ top: 320, behavior: "smooth" });
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setSelectedDevotional(devotionals[currentIndex + 1]);
      window.scrollTo({ top: 320, behavior: "smooth" });
    }
  };

  const handleSelectFromArchive = (dev: Devotional) => {
    setSelectedDevotional(dev);
    setActiveTab("devotional");
    window.scrollTo({ top: 320, behavior: "smooth" });
  };

  // ── Foreword state (API-only, no localStorage) ──────────────────────────────
  const [forewordPosts, setForewordPosts] = useState<ForewordPost[]>([]);

  // Load foreword posts from the API — on mount AND whenever the public
  // Foreword page becomes active, so a foreword just saved in the dashboard
  // shows up immediately instead of only after a full page reload.
  const loadForewordPosts = useCallback(() => {
    fetch(`${API_BASE}/foreword.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: ForewordPost[] | null) => {
        if (Array.isArray(data)) {
          setForewordPosts(data);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch the foreword list whenever the public Foreword page becomes active
  // (mount included), so a foreword saved in the dashboard shows up immediately
  // without a full page reload.
  useEffect(() => {
    if (activeTab === "foreword") loadForewordPosts();
  }, [activeTab, loadForewordPosts]);

  // Determine today's date in Lagos for Hero banner and empty state
  const timezone = "Africa/Lagos";
  const todayParts = getAdminTimezoneDate(timezone);
  const todayDateStr = `${todayParts.month} ${todayParts.day}`; // e.g. "July 20"
  const todayYear = todayParts.year;

  // Newest foreword post to feature on the public page. The API returns
  // newest-first, but sort defensively by publishedAt so we always show the
  // latest one regardless of ordering.
  const newestForeword =
    forewordPosts.length > 0
      ? [...forewordPosts].sort(
          (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        )[0]
      : null;

  // Determine current active devotional dates for the Hero banner
  // Hero always shows TODAY's mapped header image, not the selected devotional
  const currentMonth = todayParts.month;
  const currentYear = todayParts.year;

  // Successful online donation → show the full-screen thank-you page.
  if (thanksInfo) {
    return (
      <DonationThanks
        name={thanksInfo.name}
        amount={thanksInfo.amount}
        currency={thanksInfo.currency}
        isDarkMode={isDarkMode}
        onClose={() => setThanksInfo(null)}
        onHome={() => { setThanksInfo(null); navigate("/"); }}
      />
    );
  }

  if (activeTab === "dashboard") {
    if (!currentUser) return null;
    return (
      <Dashboard
        devotionals={devotionals}
        onSaveDevotional={handleSaveNewDevotional}
        onSaveMultipleDevotionals={handleSaveMultipleDevotionals}
        onUpdateDevotional={handleUpdateDevotional}
        onDeleteDevotionals={handleDeleteDevotionals}
        onRefreshDevotionals={loadDevotionals}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onExitDashboard={() => {
          // Terminate the server-side session FIRST — otherwise the next visit
          // to /admin/login re-checks the session, finds it alive, and auto-logs
          // the user back in. (Fire-and-forget; local state clears regardless.)
          fetch(`${API_BASE}/admin.php?action=logout`, { method: "POST" }).catch(() => {});
          setCurrentUser(null);
          navigate("/");
        }}
        onViewHome={() => {
          // "View Home" keeps the admin session alive — the user is NOT logged
          // out, they're just previewing the public site.
          setCurrentUser(null);
          navigate("/");
        }}
      />
    );
  }

  return (
    <div
      id="devotional-app-root"
      className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-200 text-slate-800"
      }`}
    >
      {/* 1. Navbar */}
      <Navbar
        activeTab={activeTab === "login" ? "devotional" : activeTab as "devotional" | "list" | "foreword"}
        setActiveTab={setActiveTab}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        onOpenDonate={() => setIsDonateOpen(true)}
      />

      {/* 2. Banner Hero Header — skeleton while loading so the default image
          never flashes before the configured hero image is known. */}
      {activeTab !== "login" && (
        isLoading ? <HeroSkeleton isDarkMode={isDarkMode} /> : <Hero isDarkMode={isDarkMode} heroImage={homepageHeroImage} />
      )}

      {/* 3. Main Body Context Grid */}
      <main id="main-content-area" className="flex-grow py-8 md:py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          
          {activeTab === "devotional" && (
            <div className="max-w-[1114px] mx-auto w-full">
              <div className="space-y-6">
                {isLoading ? (
                  <DevotionalSkeleton isDarkMode={isDarkMode} />
                ) : selectedDevotional ? (
                  <DevotionalView
                    devotional={selectedDevotional}
                    onPrev={handlePrev}
                    onNext={handleNext}
                    hasPrev={hasPrev}
                    hasNext={hasNext}
                    prevDevotional={hasPrev ? devotionals[currentIndex - 1] : undefined}
                    nextDevotional={hasNext ? devotionals[currentIndex + 1] : undefined}
                    isDarkMode={isDarkMode}
                    headerMap={headerMap}
                  />
                ) : (
                  <div className={`rounded-3xl p-8 md:p-14 text-center border space-y-6 ${
                    isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-100"
                  }`}>
                    {/* Calendar icon */}
                    <div className="w-16 h-16 rounded-full bg-teal-brand/10 flex items-center justify-center mx-auto">
                      <svg className="w-8 h-8 text-teal-brand" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>

                    <div className="space-y-2">
                      <p className={`font-sans font-extrabold text-xs uppercase tracking-widest ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                        {getLagosFormattedDateTime(timezone)}
                      </p>
                      <h2 className={`font-serif text-2xl md:text-3xl font-extrabold tracking-tight ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                        No Devotional for Today
                      </h2>
                      <p className={`text-sm leading-relaxed max-w-md mx-auto ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                        There is no devotional published for <strong>{todayDateStr}, {todayYear}</strong> yet.
                        The publisher will upload today's word soon — please check back later.
                      </p>
                    </div>

                    {/* Show most recent available as a suggestion */}
                    {devotionals.length > 0 && (
                      <div className={`inline-flex flex-col items-center gap-3 p-5 rounded-2xl border max-w-sm mx-auto w-full ${
                        isDarkMode ? "bg-slate-950/40 border-slate-800" : "bg-slate-50 border-slate-200"
                      }`}>
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                          Most Recent Devotional
                        </p>
                        <button
                          onClick={() => {
                            const latest = [...devotionals].sort((a, b) =>
                              getDevotionalDateValue(b.date, b.year).getTime() - getDevotionalDateValue(a.date, a.year).getTime()
                            )[0];
                            if (latest) setSelectedDevotional(latest);
                          }}
                          className="font-serif text-base font-bold text-teal-brand hover:underline"
                        >
                          {[...devotionals].sort((a, b) =>
                            getDevotionalDateValue(b.date, b.year).getTime() - getDevotionalDateValue(a.date, a.year).getTime()
                          )[0]?.title ?? "View Latest"}
                        </button>
                        <p className={`text-[11px] font-mono font-bold ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                          {[...devotionals].sort((a, b) =>
                            getDevotionalDateValue(b.date, b.year).getTime() - getDevotionalDateValue(a.date, a.year).getTime()
                          )[0]?.date} &nbsp;—&nbsp; Click to read
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "list" && (
            <div className="w-full">
              <DevotionalList
                devotionals={devotionals}
                onSelectDevotional={handleSelectFromArchive}
                isDarkMode={isDarkMode}
              />
            </div>
          )}

          {activeTab === "author" && (
            <div className="max-w-[1114px] mx-auto w-full">
              <AuthorPage isDarkMode={isDarkMode} />
            </div>
          )}

          {activeTab === "foreword" && (
            <div className="max-w-[1114px] mx-auto w-full">
              <div className="space-y-6">
                {newestForeword ? (
                  <ForewordView post={newestForeword} isDarkMode={isDarkMode} />
                ) : (
                  <div className={`rounded-3xl p-10 text-center border space-y-4 ${
                    isDarkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-100"
                  }`}>
                    <div className="w-14 h-14 rounded-full bg-teal-brand/10 flex items-center justify-center mx-auto">
                      <svg className="w-7 h-7 text-teal-brand" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h2 className={`font-serif text-2xl font-extrabold ${isDarkMode ? "text-white" : "text-slate-900"}`}>
                      No Foreword Published Yet
                    </h2>
                    <p className={`text-sm max-w-md mx-auto ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                      The author's foreword will appear here once published from the dashboard.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "login" && (
            <div className="w-full">
              <Login
                isDarkMode={isDarkMode}
                onLoginSuccess={(email) => {
                  setCurrentUser(email);
                  setTimeout(() => {
                    navigate("/dashboard");
                  }, 1500);
                }}
              />
            </div>
          )}

        </div>
      </main>

      {/* 4. Footer Channels and Copyright details */}
      <Footer isDarkMode={isDarkMode} onNavigateAuthor={() => setActiveTab("author")} onOpenDonate={() => setIsDonateOpen(true)} />

      {/* 5. Support Partnership Modal (Triggered by Donate buttons) */}
      <DonateModal
        isOpen={isDonateOpen}
        onClose={() => setIsDonateOpen(false)}
        isDarkMode={isDarkMode}
        onDonationComplete={(info) => {
          // Close the modal and replace the page with the celebration screen.
          setIsDonateOpen(false);
          setThanksInfo(info);
        }}
      />

      {/* 6. PWA — installed-app splash (standalone only) + subtle install banner */}
      <PwaSplash isReady={!isLoading} />
      <InstallPrompt />
    </div>
  );
}
