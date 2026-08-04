import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  LayoutDashboard, 
  BookOpen, 
  PlusCircle, 
  Image, 
  Users, 
  Settings, 
  LogOut, 
  User, 
  Lock, 
  Mail, 
  ShieldCheck, 
  UploadCloud, 
  Trash2, 
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Calendar,
  X,
  Plus,
  RefreshCw,
  Bell,
  Search,
  UserCheck,
  UserMinus,
  Ban,
  Fingerprint,
  Sun,
  Moon,
  Monitor,
  Send,
  Heart,
  Clock,
  CreditCard,
  FileText,
  Globe,
  Webhook,
  PanelLeftClose,
  PanelLeftOpen,
  Ruler,
  BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Devotional } from "../types";
import AddDevotional from "./AddDevotional";
import ListDevotional from "./ListDevotional";
import ImportDevotional from "./ImportDevotional";
import ManageForeword from "./ManageForeword";
import DonationSettings from "./DonationSettings";
import PaymentsDashboard from "./PaymentsDashboard";
import AnalyticsDashboard from "./AnalyticsDashboard";
import EmailAuditPanel from "./EmailAuditPanel";
import IdleTimeoutModal from "./IdleTimeoutModal";
import { API_BASE } from "../config/api";
import { apiDelete, apiPut } from "../lib/api";

interface DashboardProps {
  devotionals: Devotional[];
  onDeleteDevotionals: (ids: string[]) => Promise<void>;
  onSaveDevotional: (devotional: Omit<Devotional, "id">) => void;
  onSaveMultipleDevotionals: (devotionals: Omit<Devotional, "id">[]) => void;
  onUpdateDevotional: (devotional: Devotional) => void;
  onRefreshDevotionals?: () => Promise<Devotional[]>;
  isDarkMode: boolean;
  setIsDarkMode: (dark: boolean) => void;
  onExitDashboard: () => void;
  onViewHome?: () => void;
}

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "Administrator" | "Assistant Editor" | "Guest Writer";
  status: "Active" | "Suspended";
  createdAt: string;
}

interface MappedHeader {
  dateKey: string; // e.g., "June 7"
  fileName: string;
  dataUrl: string;
  filePath?: string;
}

// One entry in the REAL activity log feed (mirrors activity_log table rows).
interface ActivityLogEntry {
  id: string;
  action: string;
  message: string;
  entityType: string;
  entityId: string;
  actor: string;
  ipAddress: string;
  createdAt: string;
}

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string;
  fileName: string;
  fileSizeStr: string;
  mappedDay: string;
  uploadStatus: "staged" | "uploading" | "success" | "error";
  progress: number;
}

// One row of the per-devotional Telegram schedule (telegram_log table).
interface TgScheduleEntry {
  id: string;
  devotionalId: string;
  devotionalTitle: string;
  scheduledDate: string;
  scheduledYear: number;
  postTime: string;
  status: "scheduled" | "sent" | "failed" | "skipped";
  sentAt?: string | null;
  telegramMessageId?: number | null;
  error?: string | null;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Dot color for each activity category so the feed is scannable at a glance.
const activityDotColor = (action: string): string => {
  if (action.startsWith("login") || action.startsWith("logout")) return "bg-emerald-500";
  if (action.startsWith("header")) return "bg-teal-500";
  if (action.startsWith("devotional")) return "bg-indigo-500";
  if (action.startsWith("telegram")) return "bg-sky-500";
  if (action.startsWith("user")) return "bg-amber-500";
  if (action.startsWith("profile")) return "bg-violet-500";
  return "bg-slate-500";
};

// "15 minutes ago" style timestamps from the server's "YYYY-MM-DD HH:MM:SS".
const formatRelativeTime = (sql: string): string => {
  if (!sql) return "";
  const m = sql.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return sql;
  const then = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  if (Number.isNaN(then)) return sql;
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return "just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return sql.slice(0, 10);
};

export default function Dashboard({ 
  devotionals,
  onDeleteDevotionals, 
  onSaveDevotional, 
  onSaveMultipleDevotionals,
  onUpdateDevotional, 
  onRefreshDevotionals,
  isDarkMode, 
  setIsDarkMode,
  onExitDashboard,
  onViewHome
}: DashboardProps) {
  
  // Dashboard Tabs: 'overview', 'add-devotional', 'manage-devotionals', 'header-images', 'user-management', 'settings', 'import-devotional', 'telegram-integration', 'foreword', 'payments'
  const [activeTab, setActiveTab] = useState<
    "overview" | "add-devotional" | "manage-devotionals" | "header-images" | "user-management" | "settings" | "import-devotional" | "telegram-integration" | "foreword" | "payments" | "analytics"
  >("overview");

  const [isDevotionalOpen, setIsDevotionalOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashThemeOpen, setDashThemeOpen] = useState(false);

  useEffect(() => {
    if (!dashThemeOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("#dashboard-theme-dropdown")) setDashThemeOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [dashThemeOpen]);

  // Notifications/Toasts
  const [toastMsg, setToastMsg] = useState("");
  const [toastType, setToastType] = useState<"success" | "error" | "info">("success");

  const showToast = (msg: string, type: "success" | "error" | "info" = "success") => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // Admin users are source-of-truth from the database/session, not localStorage.
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => {
    // Keep the UI tied to the authenticated admin only.
    fetch(`${API_BASE}/admin.php?action=check`)
      .then((res) => res.ok ? res.json() : null)
      .then((data: { loggedIn?: boolean; user?: { email?: string; name?: string; role?: string } } | null) => {
        if (data?.loggedIn && data.user) {
          // Sync the sidebar/profile with the name the admin set during
          // installation (previously a hardcoded "Dr. Andy Osakwe" survived).
          setProfileName(data.user.name || "Admin");
          setChangeEmail(data.user.email || "");

          // Greet the freshly-logged-in admin by name (auto-dismisses).
          const name = data.user.name || data.user.email || "Admin";
          setWelcomeMsg(`Welcome back, ${name}! 👋`);
          setWelcomeVisible(true);
          setTimeout(() => setWelcomeVisible(false), 6000);
        } else {
          setUsers([]);
        }
      })
      .catch(() => setUsers([]));

    // Load the REAL user list from the database (list-users action) so newly
    // created users persist across reloads instead of only showing the session.
    const loadUsers = () => {
      fetch(`${API_BASE}/admin.php?action=list-users`)
        .then((res) => res.ok ? res.json() : null)
        .then((data: { success?: boolean; users?: AdminUser[] } | null) => {
          if (data?.success && Array.isArray(data.users)) {
            setUsers(data.users);
          }
        })
        .catch(() => { /* session check above already handles failure */ });
    };
    loadUsers();
  }, []);

  // ── Real-Time Activity Log Feed ────────────────────────────────────────────
  // Loads REAL admin activity from activity-log.php (populated by logActivity()
  // in every admin/devotional/header/telegram endpoint) and polls every 8s so
  // the feed reflects what's happening on the live site — no hardcoded demo
  // entries. Polling pauses while the admin is on another tab.
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    const loadLogs = () => {
      fetch(`${API_BASE}/activity-log.php?limit=50`)
        .then(r => (r.ok ? r.json() : null))
        .then((data: { success?: boolean; logs?: ActivityLogEntry[] } | null) => {
          if (!cancelled && data?.success && Array.isArray(data.logs)) {
            setActivityLogs(data.logs);
          }
        })
        .catch(() => {});
    };
    // Only fetch when the Overview tab is actually visible — otherwise a fetch
    // would fire on every single tab switch for a feed nobody is looking at.
    if (activeTab !== "overview") {
      return () => { cancelled = true; };
    }
    loadLogs();
    const timer = setInterval(loadLogs, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeTab]);

  // User Form states
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // Set when creating a NEW user (required). Optional on edit — leave blank to
  // keep the existing password. Mirrors the backend save-user contract.
  const [userPassword, setUserPassword] = useState("");
  const [userRole, setUserRole] = useState<"Administrator" | "Assistant Editor" | "Guest Writer">("Assistant Editor");
  const [userStatus, setUserStatus] = useState<"Active" | "Suspended">("Active");

  // Telegram Automation States
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramChannelId, setTelegramChannelId] = useState("");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramPostTime, setTelegramPostTime] = useState("06:00");
  const [telegramFooterText, setTelegramFooterText] = useState("Join our Telegram channel for daily impact words!");
  const [telegramScheduleMode, setTelegramScheduleMode] = useState("scheduled");
  const [telegramShowToken, setTelegramShowToken] = useState(false);
  const [telegramVerifyResult, setTelegramVerifyResult] = useState<{ success: boolean; botName?: string; channelTitle?: string; error?: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedTestDevId, setSelectedTestDevId] = useState("");
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramConsoleLogs, setTelegramConsoleLogs] = useState<string[]>([]);
  const [dashboardSettings, setDashboardSettings] = useState<Record<string, string>>({});

  // One-time per-mount greeting banner (dismisses itself after a few seconds).
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  // Cron setup instruction modal on the Telegram page.
  const [cronModalOpen, setCronModalOpen] = useState(false);
  const [cronCopied, setCronCopied] = useState(false);

  // ── Telegram credential persistence (localStorage mirror) ─────────────────
  // The credentials live server-side, but some shared hosts fail to return
  // them (session / encryption quirks). We ALSO mirror them to localStorage so
  // the form re-fills instantly on reload or re-login; the server value (when
  // actually present) always wins so the cache can never go stale.
  const TG_CACHE_KEY = "dailyimpact_telegram_creds";
  const readTgCache = (): Record<string, string> => {
    try { return JSON.parse(localStorage.getItem(TG_CACHE_KEY) || "{}") as Record<string, string>; }
    catch { return {}; }
  };
  const writeTgCache = (overrides: Record<string, string>) => {
    try { localStorage.setItem(TG_CACHE_KEY, JSON.stringify({ ...readTgCache(), ...overrides })); } catch { /* best-effort */ }
  };

  // ── Broadcast Scheduler states ────────────────────────────────────────────
  const [tgSchedMonth, setTgSchedMonth] = useState(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: "Africa/Lagos", month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [tgSchedYear, setTgSchedYear] = useState<number>(() => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: "Africa/Lagos", year: 'numeric' }).format(new Date()), 10);
    } catch { return new Date().getFullYear(); }
  });
  // Live Broadcast Testbed — its own month/year filter (independent of the
  // scheduler's filter) so the test dropdown shows exactly the selected period.
  const [tbMonth, setTbMonth] = useState<string>(() => {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: "Africa/Lagos", month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [tbYear, setTbYear] = useState<number>(() => {
    try {
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: "Africa/Lagos", year: 'numeric' }).format(new Date()), 10);
    } catch { return new Date().getFullYear(); }
  });
  // devotionalId -> schedule row (from GET telegram.php?action=scheduled)
  const [tgSchedMap, setTgSchedMap] = useState<Record<string, TgScheduleEntry>>({});
  const [tgSchedLoading, setTgSchedLoading] = useState(false);
  // devotionalId currently running a schedule/unschedule/send action
  const [tgSchedBusyId, setTgSchedBusyId] = useState<string>("");

  useEffect(() => {
    fetch(`${API_BASE}/settings.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: Record<string, string> | null) => {
        if (data) setDashboardSettings(data);
      })
      .catch(() => {});
  }, []);

  // Seed the Telegram config fields from persisted server settings (and the
  // localStorage mirror) so a fresh login doesn't wipe the token/channel/mode
  // (previously these were only component state and reset to defaults on
  // every dashboard mount). The cache fills the fields immediately on mount;
  // a non-empty server value then takes precedence.
  useEffect(() => {
    const server = dashboardSettings;
    const cache = readTgCache();
    const pick = (key: string, fallback = "") => {
      if (server[key] !== undefined && server[key] !== "") return server[key] as string;
      if (cache[key] !== undefined && cache[key] !== "") return cache[key];
      return fallback;
    };
    setTelegramBotToken(pick("telegram_bot_token"));
    setTelegramChannelId(pick("telegram_channel_id"));
    setTelegramEnabled(pick("telegram_enabled", "false") === "true");
    setTelegramPostTime(pick("telegram_post_time", "06:00"));
    setTelegramFooterText(pick("telegram_footer_text", "Join our Telegram channel for daily impact words!"));
    setTelegramScheduleMode(pick("telegram_schedule_mode", "scheduled"));
  }, [dashboardSettings]);

  // Load the schedule log for the selected month/year whenever the Telegram
  // tab becomes active or the filter changes.
  const loadTelegramSchedules = useCallback((month: string, year: number) => {
    setTgSchedLoading(true);
    fetch(`${API_BASE}/telegram.php?action=scheduled&month=${encodeURIComponent(month)}&year=${year}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: TgScheduleEntry[]) => {
        const map: Record<string, TgScheduleEntry> = {};
        (Array.isArray(rows) ? rows : []).forEach(r => {
          if (r && r.devotionalId) map[r.devotionalId] = r;
        });
        setTgSchedMap(map);
      })
      .catch(() => setTgSchedMap({}))
      .finally(() => setTgSchedLoading(false));
  }, []);

  useEffect(() => {
    if (activeTab === "telegram-integration") {
      loadTelegramSchedules(tgSchedMonth, tgSchedYear);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, tgSchedMonth, tgSchedYear]);

  // Load IP bans + recent failed login attempts (the "failed login track")
  useEffect(() => {
    const loadIpBans = async () => {
      try {
        const res = await fetch(`${API_BASE}/ip-bans.php`);
        if (res.ok) {
          const data = await res.json();
          setIpBans(data);
        }
      } catch (error) {
        console.error("Failed to load IP bans:", error);
      }
      try {
        const res = await fetch(`${API_BASE}/login-log.php`);
        if (res.ok) {
          const data = await res.json();
          // Keep only failures — successes are noise for the security track.
          setFailedLogins(Array.isArray(data) ? data.filter((l: any) => !l.success) : []);
        }
      } catch (error) {
        console.error("Failed to load login log:", error);
      }
    };
    loadIpBans();
  }, []);

  // IP Ban Management Functions
  const handleCreateIpBan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBanIp.trim()) {
      showToast("IP address is required", "error");
      return;
    }

    setIsCreatingBan(true);
    try {
      const res = await fetch(`${API_BASE}/ip-bans.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipAddress: newBanIp,
          reason: newBanReason || "Manual ban by admin",
          email: newBanEmail
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast("IP ban created successfully", "success");
        setNewBanIp("");
        setNewBanReason("");
        setNewBanEmail("");
        // Reload bans
        const bansRes = await fetch(`${API_BASE}/ip-bans.php`);
        if (bansRes.ok) {
          const bansData = await bansRes.json();
          setIpBans(bansData);
        }
      } else {
        const errData = await res.json();
        showToast(errData.error || "Failed to create IP ban", "error");
      }
      // Refresh the failed-attempt track too (a ban now exists for that IP).
      try {
        const res = await fetch(`${API_BASE}/login-log.php`);
        if (res.ok) {
          const data = await res.json();
          setFailedLogins(Array.isArray(data) ? data.filter((l: any) => !l.success) : []);
        }
      } catch { /* non-fatal */ }
    } catch (error) {
      showToast("Failed to create IP ban", "error");
    } finally {
      setIsCreatingBan(false);
    }
  };

  const handleRemoveIpBan = async (banId: string) => {
    try {
      const res = await fetch(`${API_BASE}/ip-bans.php?id=${banId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        showToast("IP ban removed successfully", "success");
        // Reload bans
        const bansRes = await fetch(`${API_BASE}/ip-bans.php`);
        if (bansRes.ok) {
          const bansData = await bansRes.json();
          setIpBans(bansData);
        }
      } else {
        showToast("Failed to remove IP ban", "error");
      }
      // Refresh the failed-attempt track after unbanning.
      try {
        const res = await fetch(`${API_BASE}/login-log.php`);
        if (res.ok) {
          const data = await res.json();
          setFailedLogins(Array.isArray(data) ? data.filter((l: any) => !l.success) : []);
        }
      } catch { /* non-fatal */ }
    } catch (error) {
      showToast("Failed to remove IP ban", "error");
    }
  };

  // Email Configuration Functions
  useEffect(() => {
    const loadEmailConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/email-config.php`);
        if (res.ok) {
          const data = await res.json();
          setEmailConfig(data);
        }
      } catch (error) {
        console.error("Failed to load email config:", error);
      }
    };
    loadEmailConfig();
  }, []);

  const handleSaveEmailConfig = async () => {
    try {
      await apiPut(`${API_BASE}/email-config.php`, emailConfig);
      showToast("Email configuration saved successfully", "success");
    } catch (error) {
      showToast("Failed to save email configuration", "error");
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail.trim() || !testEmail.includes('@')) {
      showToast("Please enter a valid email address", "error");
      return;
    }

    setIsSendingTestEmail(true);
    try {
      const res = await fetch(`${API_BASE}/email-config.php?action=test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(data.message || "Test email sent successfully", "success");
        setTestEmail("");
      } else {
        const errData = await res.json();
        showToast(errData.error || "Failed to send test email", "error");
      }
    } catch (error) {
      showToast("Failed to send test email", "error");
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const handleSaveTelegramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const settings = {
      telegram_bot_token: telegramBotToken,
      telegram_channel_id: telegramChannelId,
      telegram_enabled: telegramEnabled ? "true" : "false",
      telegram_post_time: telegramPostTime,
      telegram_footer_text: telegramFooterText,
      telegram_schedule_mode: telegramScheduleMode,
    };
    // Persist to API only — no localStorage fallback
    try {
      await apiPut(`${API_BASE}/settings.php`, settings);
      // Mirror to localStorage so the form re-fills even if a later session
      // check on the server can't return the secrets.
      writeTgCache({ ...settings });
      showToast("Telegram settings saved to server!", "success");
    } catch {
      showToast("Failed to save settings to server.", "error");
    }
  };

  const handleTestTelegramPost = async () => {
    if (!telegramBotToken || !telegramChannelId) {
      showToast("Please provide Bot Token and Channel ID to run a test.", "error");
      return;
    }
    const devToPost = devotionals.find(d => d.id === selectedTestDevId) || devotionals[0];
    if (!devToPost) {
      showToast("No devotionals found to send. Create one first!", "error");
      return;
    }

    setIsTestingTelegram(true);
    setTelegramConsoleLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 Connecting to Telegram API...`,
      `[${new Date().toLocaleTimeString()}] 📡 Channel: ${telegramChannelId}`,
      `[${new Date().toLocaleTimeString()}] 📖 Devotional: "${devToPost.title}"`,
    ]);

    try {
      // First save settings so the server has the latest token/channel
      await apiPut(`${API_BASE}/settings.php`, {
        telegram_bot_token: telegramBotToken,
        telegram_channel_id: telegramChannelId,
        telegram_footer_text: telegramFooterText,
      });
      // Mirror to localStorage so the fields survive reload / re-login even if
      // the server session can't confirm the credentials on a later GET.
      writeTgCache({
        telegram_bot_token: telegramBotToken,
        telegram_channel_id: telegramChannelId,
        telegram_footer_text: telegramFooterText,
      });

      setTelegramConsoleLogs(prev => [...prev,
        `[${new Date().toLocaleTimeString()}] 🔐 Credentials synced to server...`,
        `[${new Date().toLocaleTimeString()}] 📤 Sending to Telegram...`,
      ]);

      const res = await fetch(`${API_BASE}/telegram.php?action=send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devotionalId: devToPost.id }),
      });
      const json = await res.json() as { success: boolean; messageId?: number; error?: string; title?: string };

      if (json.success) {
        setTelegramConsoleLogs(prev => [...prev,
          `[${new Date().toLocaleTimeString()}] ✅ API response: 200 OK`,
          `[${new Date().toLocaleTimeString()}] 🆔 Telegram Message ID: ${json.messageId}`,
          `[${new Date().toLocaleTimeString()}] 🎉 "${devToPost.title}" is now live on your channel!`,
        ]);
        showToast("Devotional posted to Telegram successfully!", "success");
      } else {
        setTelegramConsoleLogs(prev => [...prev,
          `[${new Date().toLocaleTimeString()}] ❌ Error: ${json.error}`,
        ]);
        showToast(`Telegram error: ${json.error}`, "error");
      }
    } catch (e) {
      setTelegramConsoleLogs(prev => [...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Could not reach API server. Is "npm run server" running?`,
        `[${new Date().toLocaleTimeString()}] 💡 Start the server with: npm run server`,
      ]);
      showToast("API server not running. Start it with: npm run server", "error");
    }
    setIsTestingTelegram(false);
  };

  // ── Broadcast Scheduler actions ──────────────────────────────────────────
  // Schedule one or more devotionals to drop on their own date at postTime.
  const tgSchedule = async (devIds: string[]) => {
    if (devIds.length === 0) return;
    setTgSchedBusyId(devIds.join(","));
    try {
      const res = await fetch(`${API_BASE}/telegram.php?action=schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devotionalIds: devIds, postTime: telegramPostTime }),
      });
      const json = await res.json() as { success?: boolean; scheduled?: number; error?: string };
      if (json.success) {
        showToast(`${json.scheduled ?? devIds.length} devotional(s) scheduled for ${telegramPostTime}.`, "success");
      } else {
        showToast(`Schedule failed: ${json.error}`, "error");
      }
    } catch {
      showToast("API server not running. Start with: npm run server", "error");
    }
    setTgSchedBusyId("");
    loadTelegramSchedules(tgSchedMonth, tgSchedYear);
  };

  // Remove pending (not-yet-sent) scheduled rows for one or more devotionals.
  const tgUnschedule = async (devIds: string[]) => {
    if (devIds.length === 0) return;
    setTgSchedBusyId(devIds.join(","));
    try {
      const res = await fetch(`${API_BASE}/telegram.php?action=unschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devotionalIds: devIds }),
      });
      const json = await res.json() as { success?: boolean; removed?: number; error?: string };
      if (json.success) {
        showToast(`${json.removed ?? devIds.length} scheduled post(s) removed.`, "info");
      } else {
        showToast(`Unschedule failed: ${json.error}`, "error");
      }
    } catch {
      showToast("API server not running. Start with: npm run server", "error");
    }
    setTgSchedBusyId("");
    loadTelegramSchedules(tgSchedMonth, tgSchedYear);
  };

  // Send a single devotional RIGHT NOW (same endpoint as the testbed).
  const tgSendNow = async (devId: string) => {
    setTgSchedBusyId(devId);
    setTelegramConsoleLogs([
      `[${new Date().toLocaleTimeString()}] 🚀 Sending to Telegram...`,
      `[${new Date().toLocaleTimeString()}] 📖 Devotional ID: ${devId}`,
    ]);
    try {
      const res = await fetch(`${API_BASE}/telegram.php?action=send-now`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devotionalId: devId }),
      });
      const json = await res.json() as { success?: boolean; messageId?: number; title?: string; error?: string };
      if (json.success) {
        setTelegramConsoleLogs(prev => [...prev,
          `[${new Date().toLocaleTimeString()}] ✅ Sent! Message ID: ${json.messageId}`,
          `[${new Date().toLocaleTimeString()}] 🎉 "${json.title}" is now live!`,
        ]);
        showToast(`"${json.title}" posted to Telegram!`, "success");
      } else {
        setTelegramConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Error: ${json.error}`]);
        showToast(`Telegram error: ${json.error}`, "error");
      }
    } catch (e) {
      setTelegramConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ❌ Could not reach API server.`]);
      showToast("API server not running. Start with: npm run server", "error");
    }
    setTgSchedBusyId("");
    loadTelegramSchedules(tgSchedMonth, tgSchedYear);
  };

  // Devotionals belonging to the currently-selected scheduler month/year.
  const tgMonthDevotionals = devotionals.filter(d => {
    const parts = d.date.trim().split(/\s+/);
    return parts.length >= 2 && parts[0].toLowerCase() === tgSchedMonth.toLowerCase() && d.year === tgSchedYear;
  }).sort((a, b) => {
    const dayA = parseInt(a.date.trim().split(/\s+/)[1] || "0", 10);
    const dayB = parseInt(b.date.trim().split(/\s+/)[1] || "0", 10);
    return dayA - dayB;
  });

  const tgUnscheduledIds = tgMonthDevotionals
    .filter(d => {
      const row = tgSchedMap[d.id];
      return !row || (row.status !== "scheduled" && row.status !== "sent");
    })
    .map(d => d.id);

  // Devotionals for the TESTBED's own month/year filter.
  const tbDevotionals = devotionals.filter(d => {
    const parts = d.date.trim().split(/\s+/);
    return parts.length >= 2 && parts[0].toLowerCase() === tbMonth.toLowerCase() && d.year === tbYear;
  }).sort((a, b) => {
    const dayA = parseInt(a.date.trim().split(/\s+/)[1] || "0", 10);
    const dayB = parseInt(b.date.trim().split(/\s+/)[1] || "0", 10);
    return dayA - dayB;
  });
  // Header Image Mapping States
  const [mappedHeaders, setMappedHeaders] = useState<MappedHeader[]>([]);
  const [isSavingHeaders, setIsSavingHeaders] = useState(false);
  const [uploadMonth, setUploadMonth] = useState(() => {
    try {
      const tz = "Africa/Lagos";
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(new Date());
    } catch { return "July"; }
  });
  const [uploadDay, setUploadDay] = useState(() => {
    try {
      const tz = "Africa/Lagos";
      return new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(new Date());
    } catch { return "1"; }
  });
  const [uploadYear, setUploadYear] = useState<number>(() => {
    try {
      const tz = "Africa/Lagos";
      return parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(new Date()), 10);
    } catch { return new Date().getFullYear(); }
  });
  const [dragActive, setDragActive] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isBulkUploading, setIsBulkUploading] = useState(false);
  // Multi-select delete for header images
  const [selectedHeaderKeys, setSelectedHeaderKeys] = useState<Set<string>>(new Set());
  const [headerDeleteModal, setHeaderDeleteModal] = useState<{ open: boolean; keys: string[] }>({ open: false, keys: [] });
  const [headerDeleteCountdown, setHeaderDeleteCountdown] = useState(8);
  const headerCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Also try loading from API (richer data including file paths)
    fetch(`${API_BASE}/headers.php`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { dateKey: string; fileName: string; dataUrl: string; filePath?: string }[] | null) => {
        if (data && data.length > 0) {
          // Prefer the real server file path so uploaded images render even
          // when no base64 dataUrl was stored (upload.php-created mappings).
          setMappedHeaders(data.map(h => ({ ...h, dataUrl: h.dataUrl || h.filePath || "" })));
        }
      })
      .catch(() => { setMappedHeaders([]); });
  }, []);

  const compressImage = (base64Str: string, maxWidth: number, quality: number = 0.75): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(base64Str);
            return;
          }

          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to JPEG format with specified quality
          const compressedBase64 = canvas.toDataURL("image/jpeg", quality);
          resolve(compressedBase64);
        } catch (err) {
          console.warn("Canvas compression failed, falling back to original", err);
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
      img.src = base64Str;
    });
  };

  const saveMappedHeaders = (newHeaders: MappedHeader[]) => {
    setMappedHeaders(newHeaders);
  };

  const getDayFromFilename = (name: string): string => {
    const cleanName = name.replace(/\.[^/.]+$/, ""); // strip extension
    const matches = cleanName.match(/\d+/g);
    if (matches) {
      for (const match of matches) {
        const val = parseInt(match, 10);
        if (val >= 1 && val <= 31) {
          return val.toString();
        }
      }
    }
    return "1";
  };

  const processMultipleFiles = (files: FileList) => {
    const newStaged: StagedFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) {
        showToast(`File "${file.name}" is not a valid image.`, "error");
        continue;
      }
      
      const day = getDayFromFilename(file.name);
      const sizeStr = file.size > 1024 * 1024 
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` 
        : `${(file.size / 1024).toFixed(0)} KB`;
        
      newStaged.push({
        id: `staged-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        fileName: file.name,
        fileSizeStr: sizeStr,
        mappedDay: day,
        uploadStatus: "staged",
        progress: 0
      });
    }

    if (newStaged.length > 0) {
      setStagedFiles(prev => [...prev, ...newStaged]);
      showToast(`Added ${newStaged.length} image(s) to staging.`, "success");
    }
  };

  const startBulkUpload = async () => {
    if (stagedFiles.length === 0) return;
    setIsBulkUploading(true);
    let uploadedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < stagedFiles.length; i++) {
      const staged = stagedFiles[i];
      if (staged.uploadStatus === "success") { uploadedCount++; continue; }

      setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, uploadStatus: "uploading", progress: 10 } : f));

      try {
        // Actually send the file to the API
        const formData = new FormData();
        formData.append("file", staged.file);
        formData.append("type", "header");
        formData.append("month", uploadMonth);
        formData.append("year", String(uploadYear));
        formData.append("dateKey", `${uploadMonth} ${staged.mappedDay}`);
        formData.append("fileName", staged.fileName);

        const res = await fetch(`${API_BASE}/upload.php`, { method: "POST", body: formData });
        
        // Check content type — if it's HTML, the API routing is broken
        const contentType = res.headers.get("content-type") || "";
        
        let json: { success?: boolean; filePath?: string; error?: string };
        try {
          json = await res.json() as { success?: boolean; filePath?: string; error?: string };
        } catch (parseErr) {
          // Response is not JSON — likely HTML (SPA index.html due to rewrite issue)
          setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, uploadStatus: "error", progress: 0 } : f));
          const hint = contentType.includes("html")
            ? "Server returned HTML instead of JSON. The .htaccess rewrite rules may not be working."
            : "Server returned non-JSON response. Check server error logs.";
          errors.push(`${staged.fileName}: ${hint}`);
          console.warn("Upload: non-JSON response for", staged.fileName, "content-type:", contentType);
          continue;
        }

        if (res.ok && json.success) {
          setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, uploadStatus: "success", progress: 100 } : f));
          uploadedCount++;
        } else {
          setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, uploadStatus: "error", progress: 0 } : f));
          const errMsg = json.error || `HTTP ${res.status} ${res.statusText}`;
          errors.push(`${staged.fileName}: ${errMsg}`);
          console.warn("Upload failed for", staged.fileName, json.error);
        }
      } catch (e) {
        setStagedFiles(prev => prev.map(f => f.id === staged.id ? { ...f, uploadStatus: "error", progress: 0 } : f));
        const errMsg = e instanceof Error ? e.message : 'Network error';
        errors.push(`${staged.fileName}: ${errMsg}`);
        console.warn("Upload error for", staged.fileName, e);
      }

    }

    setIsBulkUploading(false);
    if (uploadedCount > 0) {
      const suffix = errors.length > 0 ? ` (${errors.length} failed)` : '';
      showToast(`${uploadedCount} file(s) uploaded to server!${suffix} Press Save to commit mappings.`, "success");
    } else {
      const detail = errors.length > 0 ? '\n' + errors.join('\n') : '';
      showToast(`No files were uploaded. Server says: ${detail || 'Check permissions and try again.'}`, "error");
    }
  };

  const saveStagedToMappings = async () => {
    const uploadedStaged = stagedFiles.filter(f => f.uploadStatus === "success");
    if (uploadedStaged.length === 0) {
      showToast("Please upload the staged files first.", "error");
      return;
    }

    // The bulk-upload step (startBulkUpload) already wrote every file to disk
    // AND created its header_mappings row — upload.php does both when a
    // dateKey is sent. Re-encoding each image to base64 and re-uploading it
    // through headers.php was a redundant second upload that made the
    // processing modal spin for minutes. Now we just refresh the authoritative
    // mapping list from the server (one fast request).
    setIsSavingHeaders(true);
    showToast("Mapping and saving headers...", "info");

    try {
      // Short timeout so the modal can never hang indefinitely even if the
      // server is slow or unreachable — it closes after 15s worst case.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      let rows: { dateKey: string; fileName: string; dataUrl: string; filePath?: string }[] = [];
      try {
        const res = await fetch(`${API_BASE}/headers.php`, { signal: controller.signal });
        // A failed refresh must NOT silently wipe the local gallery with an
        // empty list and claim success — treat it as an error instead.
        if (!res.ok) throw new Error(`Mapping refresh failed (HTTP ${res.status})`);
        rows = await res.json();
        if (!Array.isArray(rows)) throw new Error("Mapping refresh returned invalid data");
      } finally {
        clearTimeout(timer);
      }
      const freshHeaders: MappedHeader[] = rows.map((h: { dateKey: string; fileName: string; dataUrl: string; filePath?: string }) => ({
        dateKey: h.dateKey,
        fileName: h.fileName,
        dataUrl: h.dataUrl || h.filePath || "",
        filePath: h.filePath || "",
      }));
      saveMappedHeaders(freshHeaders);

      // Point each associated devotional at the real server file so
      // DevotionalView shows the uploaded banner (not a giant base64 blob).
      for (const staged of uploadedStaged) {
        const dateKey = `${uploadMonth} ${staged.mappedDay}`;
        const row = freshHeaders.find(h => h.dateKey.toLowerCase() === dateKey.toLowerCase());
        if (!row) continue;
        const imageUrl = row.filePath || row.dataUrl || "";
        const assocDev = devotionals.find(dev => {
          const parts = dev.date.trim().split(/\s+/);
          if (parts.length >= 2) {
            return parts[0].toLowerCase() === uploadMonth.toLowerCase() &&
              parseInt(parts[1], 10) === parseInt(staged.mappedDay, 10) &&
              dev.year === uploadYear;
          }
          return false;
        }) || devotionals.find(dev => {
          const parts = dev.date.trim().split(/\s+/);
          if (parts.length >= 2) {
            return parts[0].toLowerCase() === uploadMonth.toLowerCase() &&
              parseInt(parts[1], 10) === parseInt(staged.mappedDay, 10);
          }
          return false;
        });
        if (assocDev && imageUrl) {
          onUpdateDevotional({ ...assocDev, imageUrl });
        }
      }

      // Only clear the staging list on success. On a refresh failure the
      // staged entries are kept so "Save and Mapped" can simply be clicked
      // again — the files were already uploaded, so no re-upload is needed.
      stagedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
      setStagedFiles([]);
      showToast("Headers successfully saved, mapped, and written to disk!", "success");
    } catch (error) {
      console.error("Failed to refresh mapped headers:", error);
      showToast("Headers were uploaded, but the mapping refresh failed. Check the server.", "error");
    } finally {
      setIsSavingHeaders(false);
    }
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const updateStagedFileDay = (id: string, newDay: string) => {
    setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, mappedDay: newDay } : f));
  };

  const getAssocDevotional = (dayNum: string) => {
    return devotionals.find(dev => {
      const parts = dev.date.trim().split(/\s+/);
      if (parts.length >= 2) {
        const m = parts[0];
        const d = parts[1];
        return m.toLowerCase() === uploadMonth.toLowerCase() && parseInt(d, 10) === parseInt(dayNum, 10);
      }
      return false;
    });
  };

  // Profile Form States
  const [profileName, setProfileName] = useState("Dr. Andy Osakwe");

  // Avatar initials derived from the actual admin name (no hardcoded "AO").
  const profileInitials = profileName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "A";

  // Re-fetch devotionals every time the admin opens a devotional-management
  // tab so the list always mirrors the database (fixes rows existing in MySQL
  // but not appearing after navigation/reload).
  useEffect(() => {
    if (
      (activeTab === "manage-devotionals" || activeTab === "add-devotional" || activeTab === "import-devotional") &&
      onRefreshDevotionals
    ) {
      onRefreshDevotionals().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const [profileBio, setProfileBio] = useState("Lead pastor and teacher of Andrew Osakwe Ministries.");
  const [changeEmail, setChangeEmail] = useState("dr.andy@dailyimpact.org");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showRepeatPw, setShowRepeatPw] = useState(false);
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [show2FAQr, setShow2FAQr] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<"app" | "email">("app");
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpValue, setEmailOtpValue] = useState("");
  
  // IP Ban Management State
  const [ipBans, setIpBans] = useState<any[]>([]);
  // Recent failed login attempts (security track shown next to active bans).
  const [failedLogins, setFailedLogins] = useState<any[]>([]);
  const [newBanIp, setNewBanIp] = useState("");
  const [newBanReason, setNewBanReason] = useState("");
  const [newBanEmail, setNewBanEmail] = useState("");
  const [isCreatingBan, setIsCreatingBan] = useState(false);
  
  // Admin Timezone State
  const [adminTimezone, setAdminTimezone] = useState<string>("Africa/Lagos");
  const [settingsSubTab, setSettingsSubTab] = useState<"profile" | "security" | "assets" | "email" | "payments">("profile");
  
  // Email Configuration State
  const [emailConfig, setEmailConfig] = useState({
    mailMethod: 'resend',
    resend: {
      apiKey: '',
      fromEmail: '',
      fromName: 'Daily Impact Devotional',
      replyTo: '',
      enabled: true
    },
    smtp: {
      host: '',
      user: '',
      pass: '',
      port: '587',
      secure: 'tls',
      enabled: false
    },
    notifyEmails: ''
  });
  const [testEmail, setTestEmail] = useState("");
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  const handleTimezoneChange = (tz: string) => {
    setAdminTimezone(tz);
    setAdminTimezone(tz);
    showToast(`Admin timezone successfully set to ${tz}!`, "success");
  };
  
  // Static Homepage Hero section image state & handlers
  const [homepageHeroImage, setHomepageHeroImage] = useState<string>("");
  const [footerSponsorImage, setFooterSponsorImage] = useState<string>("");

  // Seed the branding-tab previews from the persisted server settings so the
  // uploaded hero / sponsor images survive a logout → login cycle (previously
  // the preview was only component state, so after re-auth it falsely showed
  // the default banner even though the database still had the custom image).
  useEffect(() => {
    if (dashboardSettings.homepage_hero_image) {
      setHomepageHeroImage(dashboardSettings.homepage_hero_image);
    }
    if (dashboardSettings.footer_sponsor_image) {
      setFooterSponsorImage(dashboardSettings.footer_sponsor_image);
    }
  }, [dashboardSettings]);

  // Upload an image file to the server and update a settings key on success.
  // Returns the server filePath (e.g. "/upload/homepage_hero.jpg").
  const uploadBrandImage = async (
    file: File,
    type: string,
    settingKey: string
  ): Promise<string> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    formData.append("fileName", file.name);
    const res = await fetch(`${API_BASE}/upload.php`, { method: "POST", body: formData });
    const json = await res.json() as { success?: boolean; filePath?: string; error?: string };
    if (!res.ok || !json.success) {
      throw new Error(json.error || `Upload failed (HTTP ${res.status})`);
    }
    const filePath = json.filePath || "";
    // Mirror locally so the admin preview and getActiveBannerUrl reflect the
    // change immediately.
    setDashboardSettings(prev => ({ ...prev, [settingKey]: filePath }));
    // Explicitly persist the database reference as well. upload.php normally
    // writes homepage_hero_image / footer_sponsor_image itself, but doing it
    // here too guarantees the setting survives a logout → login even if the
    // deployed PHP copy predates that behaviour.
    try {
      await apiPut(`${API_BASE}/settings.php`, { [settingKey]: filePath });
    } catch (err) {
      console.warn("Could not persist branding setting to server:", err);
    }
    return filePath;
  };

  const handleFooterSponsorImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { showToast("Only image files are permitted.", "error"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        compressImage(ev.target.result as string, 1000, 0.75).then(async (compressed) => {
          setFooterSponsorImage(compressed);
          try {
            await uploadBrandImage(file, "footer_sponsor", "footer_sponsor_image");
            showToast("Footer sponsor image updated and saved to server!", "success");
          } catch (err) {
            console.error("Footer sponsor upload failed:", err);
            showToast(`Footer sponsor image NOT saved to server: ${err instanceof Error ? err.message : "unknown error"}`, "error");
          }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleHeroImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Only image files are permitted.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const base64String = event.target.result as string;
        // Compress for the local preview, then upload the original file so the
        // website hero (Hero.tsx reads homepage_hero_image from settings.php)
        // actually changes — previously only local state was updated and the
        // toast lied about saving.
        compressImage(base64String, 1400, 0.75).then(async (compressed) => {
          setHomepageHeroImage(compressed);
          try {
            await uploadBrandImage(file, "homepage_hero", "homepage_hero_image");
            showToast("Homepage hero background updated and saved to server!", "success");
          } catch (err) {
            console.error("Hero upload failed:", err);
            showToast(`Hero image NOT saved to server: ${err instanceof Error ? err.message : "unknown error"}`, "error");
          }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const resetHeroImage = async () => {
    setHomepageHeroImage("");
    setDashboardSettings(prev => ({ ...prev, homepage_hero_image: "" }));
    try {
      await apiPut(`${API_BASE}/settings.php`, { homepage_hero_image: "" });
      showToast("Homepage hero background reset to default.", "success");
    } catch {
      showToast("Reset saved locally — server unreachable.", "error");
    }
  };

  // Pastor and Telegram Custom Identity Assets
  const [pastorPortrait, setPastorPortrait] = useState<string>("");
  const [telegramQr, setTelegramQr] = useState<string>("");
  const [telegramLink, setTelegramLink] = useState<string>("https://t.me/dailyimpactdevotional");

  // Author Page fields
  const [authorName,  setAuthorName]  = useState("Dr. Andy Osakwe");
  const [authorTitle, setAuthorTitle] = useState("Author & Founder");
  const [authorBio,   setAuthorBio]   = useState("");
  const [authorImage, setAuthorImage] = useState("");

  // Seed the Author-page fields from the persisted server settings so the
  // details entered in the dashboard actually show up on the public Author
  // page (previously they were only local state and never persisted).
  useEffect(() => {
    if (dashboardSettings.author_name)  setAuthorName(dashboardSettings.author_name);
    if (dashboardSettings.author_title) setAuthorTitle(dashboardSettings.author_title);
    if (dashboardSettings.author_bio)   setAuthorBio(dashboardSettings.author_bio);
    if (dashboardSettings.author_image) setAuthorImage(dashboardSettings.author_image);
  }, [dashboardSettings]);

  const handleAuthorImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Only image files are permitted.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        // Compress for the local preview, then upload the ORIGINAL file so the
        // public Author page (AuthorPage.tsx reads author_image from
        // settings.php) actually changes.
        compressImage(ev.target.result as string, 800, 0.80).then(async (compressed) => {
          setAuthorImage(compressed);
          try {
            await uploadBrandImage(file, "author_image", "author_image");
            showToast("Author photo uploaded and saved to server!", "success");
          } catch (err) {
            console.error("Author photo upload failed:", err);
            showToast(`Author photo NOT saved to server: ${err instanceof Error ? err.message : "unknown error"}`, "error");
          }
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const saveAuthorDetails = async () => {
    // Persist to the settings table so the public Author page reflects the
    // name/title/bio entered here (previously this only updated local state
    // and never reached the server).
    const payload: Record<string, string> = {
      author_name: authorName.trim(),
      author_title: authorTitle.trim(),
      author_bio: authorBio.trim(),
    };
    // Include the persisted author image path so the explicit Save also
    // re-affirms the DB reference even if the upload-time write was skipped.
    if (dashboardSettings.author_image) {
      payload.author_image = dashboardSettings.author_image;
    }
    try {
      await apiPut(`${API_BASE}/settings.php`, payload);
      showToast("Author details saved to server!", "success");
    } catch (err) {
      showToast(`Author details NOT saved: ${err instanceof Error ? err.message : "unknown error"}`, "error");
    }
  };

  const handlePastorPortraitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        showToast("Only image files are permitted.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64String = event.target.result as string;
          // Compress portrait image (max 500px width, quality 0.8)
          compressImage(base64String, 500, 0.80).then((compressed) => {
            setPastorPortrait(compressed);
            try {
              setPastorPortrait(compressed);
            } catch (err) {
              console.warn("Could not save pastor portrait because of quota limits:", err);
            }
            showToast("Pastor's portrait image updated successfully!", "success");
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const resetPastorPortrait = () => {
    setPastorPortrait("");
    setPastorPortrait("");
    showToast("Pastor's portrait reset to default.", "success");
  };

  const handleTelegramQrChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) {
        showToast("Only image files are permitted.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const base64String = event.target.result as string;
          // Compress QR code image (max 400px width, quality 0.8)
          compressImage(base64String, 400, 0.80).then((compressed) => {
            setTelegramQr(compressed);
            try {
              setTelegramQr(compressed);
            } catch (err) {
              console.warn("Could not save Telegram Join QR Code because of quota limits:", err);
            }
            showToast("Telegram Join QR Code updated successfully!", "success");
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const resetTelegramQr = () => {
    setTelegramQr("");
    setTelegramQr("");
    showToast("Telegram Join QR Code reset to default.", "success");
  };

  const saveTelegramLink = () => {
    setTelegramLink(telegramLink);
    showToast("Telegram channel link saved successfully!", "success");
  };

  const getActiveBannerUrl = () => {
    const customHero = dashboardSettings.homepage_hero_image;
    if (customHero) return customHero;

    const activeMonthHeader = mappedHeaders.find(h => h.dateKey.toLowerCase().startsWith(uploadMonth.toLowerCase()));
    if (activeMonthHeader) return activeMonthHeader.dataUrl || activeMonthHeader.filePath || "";

    return "/assets/images/devotional-title-default.jpg";
  };

  // Stats for Overview page
  const totalDevotionals = devotionals.length;
  const activeUsersCount = users.filter(u => u.status === "Active").length;
  const mappedHeadersCount = mappedHeaders.length;

  // Handle User creation / update — persisted to the database via save-user.
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !userEmail.trim()) {
      showToast("Please fill in both Name and Email fields.", "error");
      return;
    }

    // A password is required when CREATING a user (so they can sign in), and
    // optional when editing (blank = keep the current password).
    if (!editingUser && !userPassword.trim()) {
      showToast("Please set a password so the new user can sign in.", "error");
      return;
    }
    if (userPassword && userPassword.length < 6) {
      showToast("Password must be at least 6 characters.", "error");
      return;
    }

    const payload = {
      id: editingUser ? editingUser.id : undefined,
      name: userName,
      email: userEmail,
      role: userRole,
      status: userStatus,
      password: userPassword || undefined,
    };

    try {
      const res = await fetch(`${API_BASE}/admin.php?action=save-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }

      // Re-load the list from the server so the DB is the single source of truth.
      // Guarded with .catch so a refresh hiccup can never masquerade as a save
      // failure (the user WAS saved — we must not report the opposite).
      const list = await fetch(`${API_BASE}/admin.php?action=list-users`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: { success?: boolean; users?: AdminUser[] } | null) =>
          d?.success && Array.isArray(d.users) ? d.users : null
        )
        .catch(() => null);
      if (list) setUsers(list);

      showToast(editingUser
        ? `User "${userName}" has been updated successfully.`
        : `User "${userName}" created successfully.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Failed to save user: ${msg}`, "error");
      return;
    }

    // Reset Form
    setIsUserFormOpen(false);
    setEditingUser(null);
    setUserName("");
    setUserEmail("");
    setUserPassword("");
    setUserRole("Assistant Editor");
    setUserStatus("Active");
  };

  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setUserName(user.name);
    setUserEmail(user.email);
    setUserPassword(""); // Never prefill — blank means "keep current"
    setUserRole(user.role);
    setUserStatus(user.status);
    setIsUserFormOpen(true);
  };

  const handleDeleteUser = async (id: string, name: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin.php?action=delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      setUsers(prev => prev.filter(u => u.id !== id));
      showToast(`User "${name}" has been permanently deleted.`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Failed to delete user: ${msg}`, "error");
    }
  };

  const handleToggleSuspendUser = async (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    const nextStatus = target.status === "Active" ? "Suspended" : "Active";
    try {
      const res = await fetch(`${API_BASE}/admin.php?action=save-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: target.name,
          email: target.email,
          role: target.role,
          status: nextStatus,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
      }
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status: nextStatus } : u));
      showToast(`User "${target.name}" status changed to ${nextStatus}.`, "info");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      showToast(`Failed to update user status: ${msg}`, "error");
    }
  };

  // Header Image File Uploaders
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processMultipleFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processMultipleFiles(e.target.files);
    }
  };

  const openHeaderDeleteModal = (keys: string[]) => {
    setHeaderDeleteModal({ open: true, keys });
    setHeaderDeleteCountdown(8);
    if (headerCountdownRef.current) clearInterval(headerCountdownRef.current);
    headerCountdownRef.current = setInterval(() => {
      setHeaderDeleteCountdown(prev => {
        if (prev <= 1) {
          clearInterval(headerCountdownRef.current!);
          setHeaderDeleteModal({ open: false, keys: [] });
          return 8;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const abortHeaderDelete = () => {
    if (headerCountdownRef.current) clearInterval(headerCountdownRef.current);
    setHeaderDeleteModal({ open: false, keys: [] });
    setHeaderDeleteCountdown(8);
  };

  const confirmHeaderDelete = async () => {
    if (headerCountdownRef.current) clearInterval(headerCountdownRef.current);
    const keys = headerDeleteModal.keys;
    setHeaderDeleteModal({ open: false, keys: [] });
    setHeaderDeleteCountdown(8);
    setSelectedHeaderKeys(new Set());

    // Delete via API FIRST — await every DELETE so the local gallery only
    // updates after the server confirms. Previously errors were swallowed and
    // the row was removed locally, so a failed server delete made the image
    // "come back" on the next refresh (same bug class as the devotional list).
    const results = await Promise.allSettled(keys.map(key =>
      apiDelete(`/headers.php?dateKey=${encodeURIComponent(key)}`)
    ));
    const succeeded = keys.filter((_, i) => results[i].status === "fulfilled");
    const failed = keys.length - succeeded.length;

    if (succeeded.length > 0) {
      // Remove ONLY the headers the server actually deleted — anything that
      // failed stays in the gallery so it can be retried.
      const updated = mappedHeaders.filter(h => !succeeded.includes(h.dateKey));
      saveMappedHeaders(updated);
    }

    if (failed > 0) {
      showToast(
        `${succeeded.length} header image${succeeded.length === 1 ? "" : "s"} deleted, ${failed} failed on the server.`,
        "error"
      );
    } else {
      showToast(`${keys.length} header image${keys.length > 1 ? "s" : ""} deleted.`, "info");
    }
  };

  const toggleHeaderSelect = (key: string) => {
    setSelectedHeaderKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // Keys of every mapped header for the currently selected month — the exact
  // set the gallery grid shows. Shared by the select-all handler and the
  // checkbox's checked state so the two can never drift apart.
  const getMonthHeaderKeys = (): string[] =>
    mappedHeaders
      .filter(header => {
        const parts = header.dateKey.split(" ");
        return parts[0].toLowerCase() === uploadMonth.toLowerCase();
      })
      .map(header => header.dateKey);

  // Select-all for the header gallery: selects every mapped header for the
  // currently displayed month — so bulk deletion of a whole month's banners is
  // one click, mirroring the devotional list.
  const toggleSelectAllHeaders = () => {
    const monthKeys = getMonthHeaderKeys();
    if (monthKeys.length === 0) return;
    if (monthKeys.every(k => selectedHeaderKeys.has(k))) {
      setSelectedHeaderKeys(new Set());
    } else {
      setSelectedHeaderKeys(new Set(monthKeys));
    }
  };

  const currentMonthHeaderKeys = getMonthHeaderKeys();

  return (
    <div 
      id="admin-dashboard-layout" 
      className={`min-h-screen flex flex-col ${
        isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-200 text-slate-800"
      }`}
    >
      
      {/* IDLE TIMEOUT MODAL */}
      <IdleTimeoutModal
        idleTimeout={10 * 60 * 1000}  /* 10 minutes */
        countdownSeconds={30}
        onLogout={() => {
          // onExitDashboard (in App.tsx) terminates the server session via the
          // logout API, then clears local state — single source of truth.
          onExitDashboard();
        }}
      />

      {/* TOAST NOTIFICATION CONTAINER */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-serif text-xs font-black uppercase tracking-wider border ${
              toastType === "success" 
                ? "bg-emerald-600 border-emerald-500 text-white" 
                : toastType === "error"
                  ? "bg-rose-600 border-rose-500 text-white"
                  : "bg-teal-600 border-teal-500 text-white"
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DASHBOARD TOP HEADER */}
      <header className={`h-16 px-6 border-b flex items-center justify-between sticky top-0 z-40 backdrop-blur ${
        isDarkMode ? "bg-slate-900/90 border-slate-800" : "bg-white/90 border-slate-200"
      }`}>
        {/* Left Side: Brand Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 overflow-hidden flex items-center justify-center p-0.5 border border-slate-200 dark:border-slate-700 shrink-0">
            <img
              src="/assets/images/dailyimpact.png"
              alt="Daily Impact Devotional Logo"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <h1 className="font-serif text-sm font-black uppercase tracking-wider text-slate-950 dark:text-white leading-tight">
              Daily Impact Devotional
            </h1>
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-400">
              Admin Control Center
            </p>
          </div>
        </div>

        {/* Right Side: Quick notifications, Dark theme toggler, and Profile Avatar dropdown */}
        <div className="flex items-center gap-4">
          <button 
            type="button" 
            onClick={() => (onViewHome ? onViewHome() : onExitDashboard())}
            className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-teal-brand/10 hover:bg-teal-brand text-teal-brand hover:text-white transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            View Home
          </button>

          {/* Theme Dropdown — same as Navbar */}
          {(() => {
            const themeOptions: { mode: "light" | "dark" | "auto"; Icon: React.ElementType; tooltip: string }[] = [
              { mode: "light", Icon: Sun, tooltip: "Light" },
              { mode: "dark", Icon: Moon, tooltip: "Dark" },
              { mode: "auto", Icon: Monitor, tooltip: "Auto" },
            ];
            const currentMode: "light" | "dark" | "auto" = isDarkMode ? "dark" : "light";
            const ActiveIcon = themeOptions.find(o => o.mode === currentMode)!.Icon;
            return (
              <div className="relative" id="dashboard-theme-dropdown">
                <button
                  type="button"
                  onClick={() => setDashThemeOpen(p => !p)}
                  className={`p-1.5 rounded-lg border transition-all ${
                    isDarkMode
                      ? "bg-slate-800 border-slate-700 text-amber-400 hover:bg-slate-700"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <ActiveIcon className="w-3.5 h-3.5" />
                </button>
                {dashThemeOpen && (
                  <div className={`absolute right-0 mt-2 p-1.5 rounded-2xl border shadow-xl flex flex-col gap-1 z-50 ${
                    isDarkMode ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                  }`}>
                    {themeOptions.map(({ mode, Icon, tooltip }) => (
                      <div key={mode} className="relative group">
                        <button
                          type="button"
                          onClick={() => {
                            setDashThemeOpen(false);
                            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                            setIsDarkMode(mode === "dark" ? true : mode === "light" ? false : prefersDark);
                          }}
                          className={`p-2 rounded-xl transition-all ${
                            currentMode === mode
                              ? isDarkMode ? "bg-slate-700 text-amber-400" : "bg-slate-100 text-teal-brand"
                              : isDarkMode ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                        <div className={`absolute right-full top-1/2 -translate-y-1/2 mr-2 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity ${
                          isDarkMode ? "bg-slate-700 text-slate-100" : "bg-slate-800 text-white"
                        }`}>{tooltip}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* User profile avatar info with responsive label */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-200 dark:border-slate-800">
            
            {/* Custom interactive profile avatar */}
            <button
              onClick={() => setActiveTab("settings")}
              className="w-9 h-9 rounded-full bg-teal-brand/20 text-teal-brand border border-teal-brand/30 flex items-center justify-center font-bold hover:scale-105 active:scale-95 transition-all overflow-hidden"
              title="View Account Profile Settings"
            >
              <span className="text-xs font-black">{profileInitials}</span>
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTAINER WORKSPACE */}
      <div className="flex-1 flex">
        
        {/* DASHBOARD LEFT SIDEBAR */}
        <aside className={`${sidebarCollapsed ? "w-[72px]" : "w-64"} border-r flex flex-col hidden md:flex h-[calc(100vh-4rem)] sticky top-16 select-none transition-all duration-300 ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}>
          <div className="p-4 flex-1 space-y-1.5 overflow-y-auto no-scrollbar">
            {/* Collapse / Expand Toggle */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`w-full mb-3 py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "justify-end"} gap-2 transition-all border ${
                isDarkMode
                  ? "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                  : "border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="w-4 h-4 shrink-0" />
                : (<><span>Collapse</span><PanelLeftClose className="w-4 h-4 shrink-0" /></>)
              }
            </button>

            {/* Section header — hidden when collapsed */}
            {!sidebarCollapsed && (
              <span className="block px-3 text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3 select-none">
                Control Panel
              </span>
            )}

            {/* MAIN CATEGORY 1: OVERVIEW CONSOLE */}
            <button
              onClick={() => setActiveTab("overview")}
              title="Overview Console"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "overview"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Overview Console</span>}
            </button>

            {/* MAIN CATEGORY 2: DEVOTIONAL */}
            <div className="space-y-1">
              <button
                onClick={() => sidebarCollapsed ? setActiveTab("manage-devotionals") : setIsDevotionalOpen(!isDevotionalOpen)}
                title="Devotional"
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "justify-between"} transition-all ${
                  activeTab === "manage-devotionals" || activeTab === "add-devotional" || activeTab === "header-images" || activeTab === "import-devotional"
                    ? "bg-teal-brand/10 text-teal-brand"
                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <div className={`flex items-center ${sidebarCollapsed ? "" : "gap-2.5"}`}>
                  <BookOpen className="w-4 h-4 shrink-0" />
                  {!sidebarCollapsed && <span>Devotional</span>}
                </div>
                {!sidebarCollapsed && (
                  <span className={`text-[10px] transform transition-transform duration-200 ${isDevotionalOpen ? "rotate-180" : ""}`}>
                    ▼
                  </span>
                )}
              </button>

              {!sidebarCollapsed && isDevotionalOpen && (
                <div className="pl-6 mt-1 space-y-1 border-l border-slate-200 dark:border-slate-800 ml-5">
                  <button
                    onClick={() => setActiveTab("manage-devotionals")}
                    className={`w-full text-left py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider block transition-all ${
                      activeTab === "manage-devotionals"
                        ? "bg-teal-brand text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    List Devotionals
                  </button>
                  <button
                    onClick={() => setActiveTab("add-devotional")}
                    className={`w-full text-left py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider block transition-all ${
                      activeTab === "add-devotional"
                        ? "bg-teal-brand text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Add Devotional
                  </button>
                  <button
                    onClick={() => setActiveTab("import-devotional")}
                    className={`w-full text-left py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider block transition-all ${
                      activeTab === "import-devotional"
                        ? "bg-teal-brand text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Import Devotional
                  </button>
                  <button
                    onClick={() => setActiveTab("header-images")}
                    className={`w-full text-left py-2 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider block transition-all ${
                      activeTab === "header-images"
                        ? "bg-teal-brand text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Header Images
                  </button>
                </div>
              )}
            </div>

            {/* MAIN CATEGORY 3: USER MANAGEMENT */}
            <button
              onClick={() => setActiveTab("user-management")}
              title="User Management"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "user-management"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>User Management</span>}
            </button>

            {/* MAIN CATEGORY 4: TELEGRAM AUTOMATION */}
            <button
              onClick={() => setActiveTab("telegram-integration")}
              title="Telegram Channel"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "telegram-integration"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Send className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Telegram Channel</span>}
            </button>

            {/* MAIN CATEGORY 5: FOREWORD */}
            <button
              onClick={() => setActiveTab("foreword")}
              title="Foreword"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "foreword"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Foreword</span>}
            </button>

            {/* MAIN CATEGORY 6: PAYMENTS & DONATIONS */}
            <button
              onClick={() => setActiveTab("payments")}
              title="Payments & Donations"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "payments"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Payments & Donations</span>}
            </button>

            {/* MAIN CATEGORY 7: WEBSITE ANALYTICS */}
            <button
              onClick={() => setActiveTab("analytics")}
              title="Website Analytics"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "analytics"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Analytics</span>}
            </button>

            {/* MAIN CATEGORY 8: SETTINGS */}
            <button
              onClick={() => setActiveTab("settings")}
              title="Settings"
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center ${sidebarCollapsed ? "justify-center" : "gap-2.5"} transition-all ${
                activeTab === "settings"
                  ? "bg-teal-brand text-white shadow-md shadow-teal-brand/10"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" />
              {!sidebarCollapsed && <span>Settings</span>}
            </button>

          </div>

          {/* STICKY BOTTOM USER PROFILE & LOGOUT */}
          <div className={`mt-auto ${sidebarCollapsed ? "p-2" : "p-4"} border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 ${sidebarCollapsed ? "space-y-2" : "space-y-3"}`}>
            {/* User Profile Info Widget */}
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
              <div className="w-9 h-9 rounded-full bg-teal-brand/20 text-teal-brand flex items-center justify-center font-bold font-serif border border-teal-brand/30 shrink-0" title={profileName}>
                <span className="text-xs font-black">{profileInitials}</span>
              </div>
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-slate-900 dark:text-white truncate leading-tight">
                    {profileName}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">
                    Administrator
                  </p>
                </div>
              )}
            </div>

            {/* Logout / Exit button */}
            <button
              type="button"
              onClick={onExitDashboard}
              title="Logout"
              className={`w-full ${sidebarCollapsed ? "py-2 px-2" : "py-2 px-3"} rounded-xl text-[10px] font-black uppercase tracking-wider text-rose-500 hover:bg-rose-500/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 border border-rose-500/10 hover:border-rose-500/20`}
            >
              <LogOut className="w-3.5 h-3.5" />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* DASHBOARD RIGHT PAGE WORKSPACE */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden w-full min-w-0">

          {/* One-time welcome banner on entry */}
          {welcomeVisible && welcomeMsg && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 p-3.5 rounded-2xl border border-teal-brand/25 bg-teal-brand/5 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-teal-brand/15 text-teal-brand flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <p className="text-xs font-black text-slate-800 dark:text-white truncate">{welcomeMsg}</p>
              </div>
              <button
                type="button"
                onClick={() => setWelcomeVisible(false)}
                aria-label="Dismiss welcome"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          )}
          
          {/* MOBILE TABS SLIDER HEADER */}
          <div className="flex md:hidden items-center gap-2 overflow-x-auto pb-4 mb-4 border-b border-slate-200 dark:border-slate-800 scrollbar-none select-none">
            <button 
              onClick={() => setActiveTab("overview")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "overview" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Overview
            </button>
            <button 
              onClick={() => setActiveTab("add-devotional")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "add-devotional" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Add
            </button>
            <button 
              onClick={() => setActiveTab("manage-devotionals")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "manage-devotionals" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Manage
            </button>
            <button 
              onClick={() => setActiveTab("header-images")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "header-images" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Header Images
            </button>
            <button 
              onClick={() => setActiveTab("user-management")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "user-management" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Users
            </button>
            <button 
              onClick={() => setActiveTab("settings")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "settings" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Settings
            </button>
            <button 
              onClick={() => setActiveTab("telegram-integration")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "telegram-integration" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Telegram
            </button>
            <button 
              onClick={() => setActiveTab("analytics")} 
              className={`py-1 px-3 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0 transition-colors ${
                activeTab === "analytics" ? "bg-teal-brand text-white" : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              Analytics
            </button>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`dashboard-tab-${activeTab}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="w-full"
            >
              
              {/* VIEW 1: OVERVIEW SUMMARY CONSOLE */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  
                  {/* Greeting Block */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <h2 className="font-serif text-2xl font-black text-black dark:text-white uppercase tracking-tight">
                        Welcome Back, {profileName}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold tracking-wide mt-0.5">
                        Here is an overview of Andrew Osakwe Ministries daily devotional system logs and stats.
                      </p>
                    </div>
                    <div className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-900 border dark:border-slate-800 px-3 py-1.5 rounded-xl text-slate-500 dark:text-slate-400">
                      System Time: {(() => {
                        try {
                          const tz = dashboardSettings.admin_timezone || "Africa/Lagos";
                          const now = new Date();
                          const dayNum = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, day: 'numeric' }).format(now), 10);
                          const s = ["th","st","nd","rd"];
                          const v = dayNum % 100;
                          const ord = dayNum + (s[(v-20)%10] || s[v] || s[0]);
                          const month = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' }).format(now);
                          const year = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(now);
                          const time = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(now);
                          return `${ord} ${month} ${year}, ${time} (WAT)`;
                        } catch (e) {
                          return new Date().toLocaleString();
                        }
                      })()}
                    </div>
                  </div>

                  {/* Master Period Selector for Overview */}
                  <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row gap-4 sm:items-center justify-between ${
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-5 h-5 text-teal-brand shrink-0" />
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                          Publishing Period Filter
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Viewing statistics and mapping counts for {uploadMonth} {uploadYear}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Month selector */}
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Month</span>
                        <select
                          value={uploadMonth}
                          onChange={(e) => setUploadMonth(e.target.value)}
                          className={`py-1 px-2.5 border rounded-xl text-xs font-bold focus:outline-none ${
                            isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                          }`}
                        >
                          {MONTHS.map((m) => (
                            <option key={`overview-m-${m}`} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Year selector */}
                      <div className="flex flex-col">
                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">Year</span>
                        <select
                          value={uploadYear}
                          onChange={(e) => setUploadYear(parseInt(e.target.value, 10))}
                          className={`py-1 px-2.5 border rounded-xl text-xs font-bold focus:outline-none ${
                            isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                            <option key={`overview-y-${y}`} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Stats Cards Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Stat Card 1 */}
                    <div className={`rounded-2xl border p-5 relative flex flex-col justify-between shadow-xs transition-all duration-200 hover:shadow-sm ${
                      isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Total Devotionals
                          </span>
                          <h4 className="font-serif text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            {uploadMonth} {uploadYear}
                          </h4>
                        </div>
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
                          <BookOpen className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="mt-5 flex items-end justify-between">
                        <div className="flex items-end gap-1.5">
                          <span className="font-serif text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            {devotionals.filter(d => d.date.toLowerCase().startsWith(uploadMonth.toLowerCase()) && d.year === uploadYear).length}
                          </span>
                          <span className="text-emerald-500 text-[10px] font-bold pb-1 uppercase tracking-wider">Uploaded</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Overall: {totalDevotionals}
                        </span>
                      </div>
                    </div>

                    {/* Stat Card 2 */}
                    <div className={`rounded-2xl border p-5 relative flex flex-col justify-between shadow-xs transition-all duration-200 hover:shadow-sm ${
                      isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Mapped Header Images
                          </span>
                          <h4 className="font-serif text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            {uploadMonth} {uploadYear}
                          </h4>
                        </div>
                        <div className="p-2 bg-teal-500/10 text-teal-brand rounded-xl">
                          <Image className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="mt-5 flex items-end justify-between">
                        <div className="flex items-end gap-1.5">
                          <span className="font-serif text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            {mappedHeaders.filter(h => h.dateKey.toLowerCase().startsWith(uploadMonth.toLowerCase())).length}
                          </span>
                          <span className="text-teal-brand text-[10px] font-bold pb-1 uppercase tracking-wider">Assigned</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Overall: {mappedHeadersCount}
                        </span>
                      </div>
                    </div>

                    {/* Stat Card 3 */}
                    <div className={`rounded-2xl border p-5 relative flex flex-col justify-between shadow-xs transition-all duration-200 hover:shadow-sm ${
                      isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                    }`}>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <span className="block text-[10px] font-black uppercase tracking-wider text-slate-400">
                            Active Editors
                          </span>
                          <h4 className="font-serif text-sm font-black text-slate-800 dark:text-white uppercase tracking-tight">
                            System Users
                          </h4>
                        </div>
                        <div className="p-2 bg-indigo-500/10 text-indigo-500 rounded-xl">
                          <Users className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="mt-5 flex items-end justify-between">
                        <div className="flex items-end gap-1.5">
                          <span className="font-serif text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                            {activeUsersCount}
                          </span>
                          <span className="text-indigo-500 text-[10px] font-bold pb-1 uppercase tracking-wider">Active</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Overall: {users.length} Users
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Shortcut Buttons Panel */}
                  <div className={`p-6 rounded-2xl border ${
                    isDarkMode ? "bg-slate-900/40 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-400 mb-4">
                      Quick Publisher Shortcuts
                    </h3>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => setActiveTab("add-devotional")}
                        className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-teal-brand text-white hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4" />
                        Add Devotional
                      </button>

                      <button
                        onClick={() => setActiveTab("manage-devotionals")}
                        className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5"
                      >
                        <BookOpen className="w-4 h-4" />
                        Browse & Edit
                      </button>

                      <button
                        onClick={() => setActiveTab("header-images")}
                        className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5"
                      >
                        <Image className="w-4 h-4" />
                        Upload Header Images
                      </button>
                    </div>
                  </div>

                  {/* Activity Log Feed */}
                  <div className={`border rounded-2xl overflow-hidden ${
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <div className={`px-5 py-3.5 border-b font-serif text-xs font-black uppercase tracking-wider ${
                      isDarkMode ? "bg-slate-950 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
                    }`}>
                      Administrative Log Feed
                    </div>
                    <div className="p-4 divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-xs leading-relaxed max-h-72 overflow-y-auto">
                      {activityLogs.length === 0 && (
                        <div className="py-6 text-center text-[11px] text-slate-400 italic font-semibold">
                          No admin activity recorded yet. Actions like logins, devotional saves and header uploads will appear here in real time.
                        </div>
                      )}
                      {activityLogs.map((log) => (
                        <div key={log.id} className="py-2.5 flex items-start gap-3">
                          <span className={`w-2 h-2 rounded-full mt-1.5 ${activityDotColor(log.action)}`} />
                          <div className="min-w-0">
                            <p className="text-slate-950 dark:text-white break-words">
                              {log.message || log.action}
                            </p>
                            <span className="text-[10px] text-slate-400 font-mono font-bold">
                              {formatRelativeTime(log.createdAt)}
                              {log.actor ? ` · by ${log.actor}` : ""}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* VIEW 2: ADD DEVOTIONAL EMBED */}
              {activeTab === "add-devotional" && (
                <AddDevotional 
                  isDarkMode={isDarkMode} 
                  onSave={async (dev) => {
                    try {
                      await onSaveDevotional(dev);
                      showToast(`New daily devotional "${dev.title}" created and saved successfully!`);
                      setActiveTab("manage-devotionals");
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Unknown error';
                      showToast(`Failed to save devotional: ${msg}`, 'error');
                    }
                  }} 
                />
              )}

              {/* VIEW 2.5: IMPORT DEVOTIONAL EMBED */}
              {activeTab === "import-devotional" && (
                <ImportDevotional 
                  isDarkMode={isDarkMode} 
                  existingDevotionals={devotionals}
                  onCancel={() => setActiveTab("manage-devotionals")}
                  onSaveMultiple={async (devs) => {
                    try {
                      await onSaveMultipleDevotionals(devs);
                      showToast(`Successfully imported ${devs.length} daily devotionals!`);
                      setActiveTab("manage-devotionals");
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Unknown error';
                      showToast(`Failed to import: ${msg}`, 'error');
                    }
                  }} 
                />
              )}

              {/* VIEW 3: MANAGE DEVOTIONALS EMBED */}
              {activeTab === "manage-devotionals" && (
                <ListDevotional 
                  devotionals={devotionals}
                  isDarkMode={isDarkMode}
                  onUpdate={async (dev) => {
                    try {
                      await onUpdateDevotional(dev);
                      showToast(`Devotional "${dev.title}" has been updated successfully!`);
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Unknown error';
                      showToast(`Failed to update devotional: ${msg}`, 'error');
                    }
                  }}
                  onDelete={async (ids) => {
                    try {
                      await onDeleteDevotionals(ids);
                      showToast(`${ids.length} devotional${ids.length > 1 ? "s" : ""} deleted.`, "info");
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : 'Unknown error';
                      showToast(`Failed to refresh the list after delete: ${msg}`, 'error');
                    }
                  }}
                  onDeleteError={(err) => {
                    const msg = err instanceof Error ? err.message : 'Unknown error';
                    // With a multi-select batch some deletes may have succeeded
                    // before the first failure — don't claim none were removed.
                    showToast(`Failed to delete devotional: ${msg}.`, 'error');
                  }}
                />
              )}

              {/* VIEW 4: HEADER IMAGE MANAGER */}
              {activeTab === "header-images" && (
                <div className="space-y-6">
                  {/* Page Header */}
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                    <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
                      <Image className="w-6 h-6 text-teal-brand" />
                      Devotional Headers
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                      Configure custom monthly title banners. Select Month and Year, drag in up to 31 files at once. Filenames will auto-map to their corresponding dates.
                    </p>
                  </div>

                  {/* Dropdowns for Month and Year */}
                  <div className={`p-4 rounded-2xl border flex flex-wrap gap-4 items-center justify-between ${
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-teal-brand shrink-0" />
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">Active Publishing Period</h4>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Specify month and year to manage</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      {/* Month dropdown */}
                      <div className="space-y-1">
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Month</span>
                        <select
                          value={uploadMonth}
                          onChange={(e) => setUploadMonth(e.target.value)}
                          className={`py-1.5 px-3 border rounded-xl text-xs font-bold focus:outline-none ${
                            isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                          }`}
                        >
                          {MONTHS.map((m) => (
                            <option key={`m-drop-${m}`} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>

                      {/* Year dropdown */}
                      <div className="space-y-1">
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-wider">Year</span>
                        <select
                          value={uploadYear}
                          onChange={(e) => setUploadYear(parseInt(e.target.value, 10))}
                          className={`py-1.5 px-3 border rounded-xl text-xs font-bold focus:outline-none ${
                            isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                          }`}
                        >
                          {Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 2 + i).map((y) => (
                            <option key={`y-drop-${y}`} value={y}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* LEFT PANEL (Col span 5): Image Dropzone and Staged Upload Section */}
                    <div className="lg:col-span-5 space-y-4">
                      
                      {/* Uploader Dropzone */}
                      <div 
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all relative cursor-pointer ${
                          dragActive 
                            ? "border-teal-brand bg-teal-brand/10 scale-[1.01]" 
                            : isDarkMode 
                              ? "border-slate-800 hover:border-teal-brand/50 bg-slate-900/50" 
                              : "border-slate-300 hover:border-teal-brand/50 bg-slate-50"
                        }`}
                      >
                        <input
                          type="file"
                          id="bulk-headers-input"
                          accept="image/*"
                          multiple
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        
                        <label 
                          htmlFor="bulk-headers-input" 
                          className="flex flex-col items-center justify-center cursor-pointer space-y-3 select-none"
                        >
                          <div className="w-12 h-12 rounded-full bg-teal-brand/10 flex items-center justify-center text-teal-brand">
                            <UploadCloud className="w-6 h-6 animate-pulse" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-teal-brand hover:underline block mb-1">
                              Click to select multiple files
                            </span>
                            <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                              or drag and drop up to 31 images at a time
                            </span>
                          </div>
                          <p className="text-[9px] text-slate-400 max-w-xs leading-normal">
                            We will extract day numbers from filenames automatically (e.g. "01.png" maps to Day 1)
                          </p>
                        </label>
                      </div>

                      {/* Staged Files Queue Panel */}
                      {stagedFiles.length > 0 && (
                        <div className={`p-4 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                        }`}>
                          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-teal-brand animate-ping" />
                              <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                                Staging Queue ({stagedFiles.length})
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                stagedFiles.forEach(f => URL.revokeObjectURL(f.previewUrl));
                                setStagedFiles([]);
                              }}
                              className="text-[10px] text-slate-400 hover:text-rose-500 font-bold uppercase tracking-widest"
                            >
                              Clear All
                            </button>
                          </div>

                          {/* Scrollable file list */}
                          <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
                            {stagedFiles.map((staged) => (
                              <div key={staged.id} className="pt-2.5 flex items-center gap-3 justify-between">
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  {/* Small Thumbnail */}
                                  <img 
                                    src={staged.previewUrl} 
                                    alt="Preview" 
                                    className="w-10 h-10 rounded-lg object-cover bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shrink-0"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-bold text-slate-900 dark:text-white truncate leading-tight">
                                      {staged.fileName}
                                    </p>
                                    <p className="text-[9px] text-slate-400 font-bold mt-1">
                                      {staged.fileSizeStr}
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Day Selector */}
                                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950 px-2 py-1 rounded-lg border border-slate-200/60 dark:border-slate-800">
                                    <span className="text-[9px] font-black uppercase text-slate-400">Day:</span>
                                    <select
                                      value={staged.mappedDay}
                                      onChange={(e) => updateStagedFileDay(staged.id, e.target.value)}
                                      className="bg-transparent text-[11px] font-extrabold focus:outline-none cursor-pointer"
                                    >
                                      {Array.from({ length: 31 }, (_, i) => (i + 1).toString()).map((d) => (
                                        <option key={`staged-day-${staged.id}-${d}`} value={d}>{d}</option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Status indicator / loader */}
                                  <div className="w-12 flex justify-center">
                                    {staged.uploadStatus === "staged" && (
                                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                        Ready
                                      </span>
                                    )}
                                    {staged.uploadStatus === "uploading" && (
                                      <div className="w-full flex flex-col items-center gap-0.5">
                                        <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                          <div 
                                            className="h-full bg-teal-brand rounded-full transition-all duration-100"
                                            style={{ width: `${staged.progress}%` }}
                                          />
                                        </div>
                                        <span className="text-[8px] font-bold font-mono text-teal-brand">
                                          {staged.progress}%
                                        </span>
                                      </div>
                                    )}
                                    {staged.uploadStatus === "success" && (
                                      <span className="text-[10px] bg-emerald-500/10 text-emerald-500 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                                        ✓ Ok
                                      </span>
                                    )}
                                  </div>

                                  {/* Remove Staged */}
                                  <button
                                    type="button"
                                    onClick={() => removeStagedFile(staged.id)}
                                    className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-500/5"
                                    title="Unstage file"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Actions Footer */}
                          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                            <button
                              type="button"
                              onClick={startBulkUpload}
                              disabled={isBulkUploading || stagedFiles.every(f => f.uploadStatus === "success")}
                              className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-900 dark:hover:bg-slate-600 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                            >
                              {isBulkUploading ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <UploadCloud className="w-3.5 h-3.5" />
                                  Upload Images
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={saveStagedToMappings}
                              disabled={stagedFiles.filter(f => f.uploadStatus === "success").length === 0 || isBulkUploading}
                              className="flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-teal-brand text-white hover:opacity-90 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-teal-brand/10"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Save & Map Headers
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="p-3.5 rounded-xl bg-teal-brand/5 border border-teal-brand/10 text-[10px] text-teal-600 dark:text-teal-400 font-bold leading-relaxed">
                        💡 <span className="uppercase font-extrabold">Workflow Tip:</span> To bulk assign backgrounds, drop in up to 31 images. Filenames containing date digits (like "June_7.jpg" or "07.png") will map instantly to that date index. Once uploaded, click "Save & Map Headers" to link.
                      </div>
                    </div>

                    {/* RIGHT PANEL (Col span 7): Mapped Image Gallery sorted by Days */}
                    <div className="lg:col-span-7 space-y-4">
                      
                      {/* ── Header Delete Confirmation Modal ──────────────── */}
                      <AnimatePresence>
                        {headerDeleteModal.open && (
                          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={abortHeaderDelete} />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 16 }}
                              transition={{ type: "spring", damping: 25, stiffness: 350 }}
                              className={`relative w-full max-w-md rounded-3xl p-7 border shadow-2xl text-center space-y-5 ${
                                isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
                              }`}
                            >
                              <button onClick={abortHeaderDelete} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
                                <X className="w-4 h-4" />
                              </button>
                              <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto">
                                <AlertTriangle className="w-7 h-7 text-rose-500" />
                              </div>
                              <div>
                                <h3 className="font-serif text-lg font-black">Delete Header Image{headerDeleteModal.keys.length > 1 ? "s" : ""}</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                  Permanently delete <strong>{headerDeleteModal.keys.length}</strong> header image{headerDeleteModal.keys.length > 1 ? "s" : ""}? This cannot be undone.
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <button onClick={abortHeaderDelete}
                                  className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                    isDarkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                                  }`}>
                                  Cancel
                                </button>
                                <button onClick={confirmHeaderDelete}
                                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-rose-500 hover:bg-rose-600 text-white transition-all flex items-center justify-center gap-2 relative overflow-hidden">
                                  <span className="absolute inset-0 bg-rose-700/40 origin-left transition-none"
                                    style={{ transform: `scaleX(${headerDeleteCountdown / 8})` }} />
                                  <Trash2 className="w-3.5 h-3.5 relative z-10" />
                                  <span className="relative z-10">Delete ({headerDeleteCountdown}s)</span>
                                </button>
                              </div>
                              <p className="text-[10px] text-slate-400 font-bold">Auto-aborts in {headerDeleteCountdown}s if no action taken.</p>
                            </motion.div>
                          </div>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-400">
                          Active Custom Mapped Headers for {uploadMonth} {uploadYear}
                        </h3>
                        <div className="flex items-center gap-2">
                          {/* Select-all checkbox — picks every mapped header for this month */}
                          {currentMonthHeaderKeys.length > 0 && (
                            <label
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest cursor-pointer select-none transition-colors ${
                                currentMonthHeaderKeys.length > 0 && currentMonthHeaderKeys.every(k => selectedHeaderKeys.has(k))
                                  ? "bg-rose-500/10 text-rose-500 border-rose-500/30"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-800 dark:hover:text-white"
                              }`}
                              title={currentMonthHeaderKeys.every(k => selectedHeaderKeys.has(k)) ? "Deselect all headers for this month" : "Select all headers for this month"}
                            >
                              <input
                                type="checkbox"
                                checked={currentMonthHeaderKeys.length > 0 && currentMonthHeaderKeys.every(k => selectedHeaderKeys.has(k))}
                                onChange={toggleSelectAllHeaders}
                                className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                              />
                              Select All
                            </label>
                          )}
                          <span className="text-[10px] bg-teal-brand/10 text-teal-brand font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-teal-brand/10">
                            {mappedHeaders.filter(h => h.dateKey.toLowerCase().startsWith(uploadMonth.toLowerCase())).length} Active Banners
                          </span>
                        </div>
                      </div>

                      {/* Bulk delete toolbar for headers */}
                      {selectedHeaderKeys.size > 0 && (
                        <div className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
                          isDarkMode ? "bg-rose-950/30 border-rose-900/50" : "bg-rose-50 border-rose-200"
                        }`}>
                          <span className="text-xs font-black text-rose-600 dark:text-rose-400">
                            {selectedHeaderKeys.size} image{selectedHeaderKeys.size > 1 ? "s" : ""} selected
                          </span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setSelectedHeaderKeys(new Set())}
                              className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all ${
                                isDarkMode ? "border-slate-700 text-slate-400 hover:text-white" : "border-slate-200 text-slate-500 hover:text-slate-900"
                              }`}>
                              Deselect All
                            </button>
                            <button onClick={() => openHeaderDeleteModal(Array.from(selectedHeaderKeys))}
                              className="text-xs font-black px-3 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white transition-all flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete Selected
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Filter headers to currently selected Month */}
                      {mappedHeaders.filter(header => {
                        const parts = header.dateKey.split(" ");
                        return parts[0].toLowerCase() === uploadMonth.toLowerCase();
                      }).length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {[...mappedHeaders]
                            .filter(header => {
                              const parts = header.dateKey.split(" ");
                              return parts[0].toLowerCase() === uploadMonth.toLowerCase();
                            })
                            .sort((a, b) => {
                              const dayA = parseInt(a.dateKey.split(" ")[1], 10) || 0;
                              const dayB = parseInt(b.dateKey.split(" ")[1], 10) || 0;
                              return dayA - dayB;
                            })
                            .map((header) => {
                              const dayNum = header.dateKey.split(" ")[1];
                              const assocDevotional = getAssocDevotional(dayNum);
                              const isHeaderSelected = selectedHeaderKeys.has(header.dateKey);

                              return (
                                <div
                                  key={`header-item-${header.dateKey}`}
                                  className={`border rounded-xl overflow-hidden shadow-sm hover:shadow-md relative group flex flex-col justify-between transition-all ${
                                    isHeaderSelected
                                      ? "border-rose-400 ring-2 ring-rose-400/30"
                                      : isDarkMode ? "bg-slate-900 border-slate-800 hover:border-slate-800" : "bg-white border-slate-200 hover:border-slate-350"
                                  }`}
                                >
                                  {/* Checkbox overlay — top-left */}
                                  <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
                                    <input
                                      type="checkbox"
                                      checked={isHeaderSelected}
                                      onChange={() => toggleHeaderSelect(header.dateKey)}
                                      className="w-4 h-4 accent-rose-500 cursor-pointer rounded"
                                      title="Select for bulk delete"
                                    />
                                  </div>

                                  {/* Header Thumbnail Preview */}
                                  <div className="h-28 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative">
                                    <img
                                      src={header.dataUrl || header.filePath || ""}
                                      alt={`Banner for ${header.dateKey}`}
                                      className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-500"
                                      referrerPolicy="no-referrer"
                                    />
                                    
                                    {/* Mapped Date Badge */}
                                    <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/80 backdrop-blur-sm text-white text-[10px] font-black uppercase tracking-widest rounded-lg border border-slate-800">
                                      {header.dateKey}
                                    </span>

                                    {/* STICKY/HOVER CANCEL TO REMOVE UPLOAD */}
                                    <button
                                      type="button"
                                      onClick={() => openHeaderDeleteModal([header.dateKey])}
                                      className="absolute top-2 right-2 w-7 h-7 bg-black/75 backdrop-blur-sm hover:bg-rose-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-md active:scale-90"
                                      title="Delete this header image"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  
                                  {/* Associated Devotional Link Area */}
                                  <div className="p-3 border-t border-slate-50 dark:border-slate-950 bg-slate-50/40 dark:bg-slate-950/20 space-y-1">
                                    <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-tight">
                                      Associated Devotional:
                                    </p>
                                    
                                    {assocDevotional ? (
                                      <p className="text-[11px] font-extrabold text-teal-brand truncate font-serif" title={assocDevotional.title}>
                                        📖 {assocDevotional.title}
                                      </p>
                                    ) : (
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold italic">
                                        No devotional scheduled for this day
                                      </p>
                                    )}

                                    <div className="flex items-center justify-between text-[8px] font-mono font-bold text-slate-400/80 pt-1">
                                      <span className="truncate max-w-[130px]">{header.fileName}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className={`p-16 text-center rounded-2xl border border-dashed ${
                          isDarkMode ? "border-slate-800 text-slate-500 bg-slate-900/10" : "border-slate-200 text-slate-400 bg-slate-50/50"
                        } font-serif text-xs font-black italic space-y-2`}>
                          <p>No custom headers mapped for {uploadMonth} yet.</p>
                          <p className="text-[10px] font-sans text-slate-400 font-normal tracking-wide leading-relaxed">
                            Default illustrations will dynamically represent devotionals on the homepage. Drag in header images to override.
                          </p>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* VIEW 5: USER MANAGEMENT */}
              {activeTab === "user-management" && (
                <div className="space-y-6">
                  
                  {/* Page header and Add User button trigger */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div>
                      <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
                        <Users className="w-6 h-6 text-teal-brand" />
                        User Management Portal
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                        Control staff credentials, suspend logins, or add assistant editors to Andrew Osakwe Ministries.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingUser(null);
                        setUserName("");
                        setUserEmail("");
                        setUserRole("Assistant Editor");
                        setUserStatus("Active");
                        setIsUserFormOpen(true);
                      }}
                      className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-teal-brand text-white hover:opacity-90 active:scale-[0.98] transition-all flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Plus className="w-4 h-4" />
                      Add Staff User
                    </button>
                  </div>

                  {/* USER FORM MODAL */}
                  <AnimatePresence>
                    {isUserFormOpen && (
                      <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className={`w-full max-w-md rounded-2xl border overflow-hidden p-6 space-y-4 shadow-2xl relative ${
                            isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                          }`}
                        >
                          {/* Close button */}
                          <button
                            type="button"
                            onClick={() => setIsUserFormOpen(false)}
                            className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>

                          <h3 className="font-serif text-lg font-black uppercase tracking-tight">
                            {editingUser ? "Edit Staff User" : "Add New Staff User"}
                          </h3>

                          <form onSubmit={handleSaveUser} className="space-y-4 text-xs font-semibold">
                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Full Name</label>
                              <input
                                type="text"
                                value={userName}
                                onChange={(e) => setUserName(e.target.value)}
                                placeholder="e.g. Kolawole Daniel"
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                } focus:border-teal-brand`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Email Address</label>
                              <input
                                type="email"
                                value={userEmail}
                                onChange={(e) => setUserEmail(e.target.value)}
                                placeholder="name@dailyimpact.org"
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                } focus:border-teal-brand`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                                {editingUser ? "Password (blank = keep current)" : "Password"}
                              </label>
                              <input
                                type="password"
                                value={userPassword}
                                onChange={(e) => setUserPassword(e.target.value)}
                                placeholder={editingUser ? "Leave blank to keep current password" : "Minimum 6 characters"}
                                autoComplete="new-password"
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                } focus:border-teal-brand`}
                              />
                              {!editingUser && (
                                <p className="text-[10px] text-slate-400 font-semibold pt-0.5">
                                  The new user can sign in immediately with this password.
                                </p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Security Access Level</label>
                              <select
                                value={userRole}
                                onChange={(e) => setUserRole(e.target.value as any)}
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                } focus:border-teal-brand`}
                              >
                                <option value="Administrator">Administrator</option>
                                <option value="Assistant Editor">Assistant Editor</option>
                                <option value="Guest Writer">Guest Writer</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Current Status</label>
                              <select
                                value={userStatus}
                                onChange={(e) => setUserStatus(e.target.value as any)}
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                } focus:border-teal-brand`}
                              >
                                <option value="Active">Active</option>
                                <option value="Suspended">Suspended</option>
                              </select>
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setIsUserFormOpen(false)}
                                className={`py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider ${
                                  isDarkMode ? "bg-slate-800 hover:bg-slate-750 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-900"
                                }`}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                className="py-2 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-teal-brand text-white hover:opacity-90 active:scale-[0.98] transition-all"
                              >
                                Save Details
                              </button>
                            </div>
                          </form>
                        </motion.div>
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Users Grid/List Table */}
                  <div className={`border rounded-2xl overflow-hidden shadow-sm ${
                    isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
                  }`}>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className={`border-b font-serif text-[10px] font-black uppercase tracking-wider ${
                            isDarkMode ? "bg-slate-950 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-100 text-slate-500"
                          }`}>
                            <th className="py-3 px-5">Staff Identity</th>
                            <th className="py-3 px-5">Credentials Email</th>
                            <th className="py-3 px-5">Access Level</th>
                            <th className="py-3 px-5">Status</th>
                            <th className="py-3 px-5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-xs">
                          {users.map((user) => (
                            <tr key={`user-row-${user.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-teal-brand/10 text-teal-brand flex items-center justify-center font-serif font-black text-xs">
                                    {user.name.split(" ").map(n => n[0]).join("")}
                                  </div>
                                  <div>
                                    <p className="text-slate-950 dark:text-white font-black">{user.name}</p>
                                    <span className="text-[10px] font-mono text-slate-400 font-bold">Created {user.createdAt}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5 text-slate-600 dark:text-slate-300 font-mono">
                                {user.email}
                              </td>
                              <td className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                                <span className={`px-2 py-1 rounded-md ${
                                  user.role === "Administrator" 
                                    ? "bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/30" 
                                    : user.role === "Assistant Editor"
                                      ? "bg-teal-100 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-900/30"
                                      : "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/30"
                                }`}>
                                  {user.role}
                                </span>
                              </td>
                              <td className="py-4 px-5 font-bold uppercase tracking-wider text-[10px]">
                                <span className={`px-2 py-1 rounded-md ${
                                  user.status === "Active" 
                                    ? "bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400" 
                                    : "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                                }`}>
                                  {user.status}
                                </span>
                              </td>
                              <td className="py-4 px-5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Toggle Suspend */}
                                  <button
                                    onClick={() => handleToggleSuspendUser(user.id)}
                                    className={`p-1 rounded-md border ${
                                      user.status === "Active"
                                        ? "text-amber-500 border-amber-200 dark:border-amber-900/20 hover:bg-amber-500/10"
                                        : "text-emerald-500 border-emerald-200 dark:border-emerald-900/20 hover:bg-emerald-500/10"
                                    }`}
                                    title={user.status === "Active" ? "Suspend user access" : "Activate user access"}
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Edit user details */}
                                  <button
                                    onClick={() => handleEditUser(user)}
                                    className="p-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                                    title="Edit user details"
                                  >
                                    <Settings className="w-3.5 h-3.5" />
                                  </button>

                                  {/* Delete user */}
                                  {user.name !== "Dr. Andy Osakwe" && (
                                    <button
                                      onClick={() => handleDeleteUser(user.id, user.name)}
                                      className="p-1 rounded-md border border-rose-200 dark:border-rose-950 text-rose-500 hover:bg-rose-500/10"
                                      title="Delete Staff Access"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                </div>
              )}

              {/* VIEW 6: ACCOUNT PROFILE & SECURITY SETTINGS */}
              {activeTab === "settings" && (
                <div className="space-y-6">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                    <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
                      <Settings className="w-6 h-6 text-teal-brand" />
                      <span className="text-black dark:text-white">Publisher Settings</span>
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                      Configure your staff profile, daily release timezone, security options, and customize homepage branding assets.
                    </p>
                  </div>

                  {/* Settings Tab Selector */}
                  <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6 text-xs font-bold uppercase tracking-wider pb-px">
                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("profile")}
                      className={`pb-2.5 px-1 border-b-2 transition-all flex items-center gap-2 ${
                        settingsSubTab === "profile"
                          ? "border-teal-brand text-teal-brand font-black"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      <User className="w-4 h-4" />
                      Profile & Timezone
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("security")}
                      className={`pb-2.5 px-1 border-b-2 transition-all flex items-center gap-2 ${
                        settingsSubTab === "security"
                          ? "border-teal-brand text-teal-brand font-black"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      Security & 2FA
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("assets")}
                      className={`pb-2.5 px-1 border-b-2 transition-all flex items-center gap-2 ${
                        settingsSubTab === "assets"
                          ? "border-teal-brand text-teal-brand font-black"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      <Image className="w-4 h-4" />
                      Branding & Assets
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("email")}
                      className={`pb-2.5 px-1 border-b-2 transition-all flex items-center gap-2 ${
                        settingsSubTab === "email"
                          ? "border-teal-brand text-teal-brand font-black"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      <Mail className="w-4 h-4" />
                      Email & Audit Log
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsSubTab("payments")}
                      className={`pb-2.5 px-1 border-b-2 transition-all flex items-center gap-2 ${
                        settingsSubTab === "payments"
                          ? "border-teal-brand text-teal-brand font-black"
                          : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      Payments & Donations
                    </button>
                  </div>

                  {/* Tab Contents */}
                  <div className="text-xs font-semibold">
                    
                    {/* Tab 1: Profile & Timezone */}
                    {settingsSubTab === "profile" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-200">
                        
                        {/* Staff Profile details */}
                        <div className={`p-6 rounded-2xl border space-y-5 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-teal-brand" />
                            Staff Profile Details
                          </h3>

                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="text-slate-500">Public/Author Name</label>
                              <input
                                type="text"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-slate-500">Author Bio</label>
                              <textarea
                                rows={3}
                                value={profileBio}
                                onChange={(e) => setProfileBio(e.target.value)}
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`}
                              />
                            </div>

                            <div className="space-y-1">
                              <label className="text-slate-500">Credential Email Address</label>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                  type="email"
                                  value={changeEmail}
                                  onChange={(e) => setChangeEmail(e.target.value)}
                                  className={`w-full py-2 pl-9 pr-3 border rounded-xl focus:outline-none ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={async () => {
                                // Persist name/email to admin_users + session and
                                // update the author_name default used for new devotionals.
                                try {
                                  const res = await fetch(`${API_BASE}/admin.php?action=update-profile`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ name: profileName, email: changeEmail }),
                                  });
                                  const json = await res.json();
                                  if (!res.ok || !json.success) {
                                    showToast(json.message || json.error || "Failed to update profile.", "error");
                                    return;
                                  }
                                  setProfileName(json.user?.name || profileName);
                                  setChangeEmail(json.user?.email || changeEmail);
                                  setUsers([{ id: "current-admin", name: json.user?.name || profileName, email: json.user?.email || changeEmail, role: "Administrator", status: "Active", createdAt: "" }]);
                                  showToast("Staff profile details updated successfully.");
                                } catch {
                                  showToast("Server unreachable — profile not updated.", "error");
                                }
                              }}
                              className="py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-teal-brand text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
                            >
                              Update Profile Info
                            </button>
                          </div>
                        </div>

                        {/* Admin Timezone Settings */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-teal-brand" />
                            Daily Devotional Timezone
                          </h3>
                          
                          <p className="text-[11px] leading-relaxed text-slate-500">
                            Configure the global release timezone. Once it strikes 12:00 AM (midnight) in this timezone, the homepage automatically refreshes to display the next devotional.
                          </p>

                          <div className="space-y-1">
                            <label className="text-slate-500 block">Select Release Timezone</label>
                            <select
                              value={adminTimezone}
                              onChange={(e) => handleTimezoneChange(e.target.value)}
                              className={`w-full py-2 px-3 border rounded-xl font-bold focus:outline-none ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`}
                            >
                              <option value="Africa/Lagos">Africa/Lagos (West Africa Time - GMT+1)</option>
                              <option value="UTC">UTC (Coordinated Universal Time - GMT+0)</option>
                              <option value="Europe/London">Europe/London (Greenwich Mean Time / BST - GMT+0/+1)</option>
                              <option value="America/New_York">America/New_York (Eastern Time - GMT-5/-4)</option>
                              <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time - GMT-8/-7)</option>
                              <option value="Asia/Tokyo">Asia/Tokyo (Japan Standard Time - GMT+9)</option>
                              <option value="Asia/Kolkata">Asia/Kolkata (Indian Standard Time - GMT+5:30)</option>
                              <option value="Australia/Sydney">Australia/Sydney (Eastern Australian Time - GMT+10/+11)</option>
                            </select>
                          </div>
                          
                          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-teal-brand/5 border border-teal-brand/10 text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                            <span>🌐</span>
                            <span>
                              Current time in selected zone: {
                                (() => {
                                  try {
                                    return new Intl.DateTimeFormat('en-US', {
                                      timeZone: adminTimezone,
                                      dateStyle: 'medium',
                                      timeStyle: 'short'
                                    }).format(new Date());
                                  } catch (e) {
                                    return new Date().toLocaleTimeString();
                                  }
                                })()
                              }
                            </span>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Tab 2: Security & 2FA */}
                    {settingsSubTab === "security" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-200">
                        
                        {/* Password reset area */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Lock className="w-4 h-4 text-teal-brand" />
                            Update Account Password
                          </h3>

                          <div className="space-y-3">
                            {/* Current Password */}
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Current Password</label>
                              <div className="relative">
                                <input
                                  type={showCurrentPw ? "text" : "password"}
                                  placeholder="••••••••"
                                  value={currentPassword}
                                  onChange={(e) => setCurrentPassword(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand transition-colors"
                                  tabIndex={-1}
                                >
                                  {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* New Password */}
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">New Password</label>
                              <div className="relative">
                                <input
                                  type={showNewPw ? "text" : "password"}
                                  placeholder="••••••••"
                                  value={newPassword}
                                  onChange={(e) => setNewPassword(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowNewPw(!showNewPw)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand transition-colors"
                                  tabIndex={-1}
                                >
                                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Repeat New Password */}
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Repeat New Password</label>
                              <div className="relative">
                                <input
                                  type={showRepeatPw ? "text" : "password"}
                                  placeholder="••••••••"
                                  value={repeatPassword}
                                  onChange={(e) => setRepeatPassword(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    repeatPassword && repeatPassword !== newPassword
                                      ? "border-rose-400 focus:ring-rose-400/20"
                                      : repeatPassword && repeatPassword === newPassword
                                      ? "border-emerald-400 focus:ring-emerald-400/20"
                                      : isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  } ${isDarkMode ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowRepeatPw(!showRepeatPw)}
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-brand transition-colors"
                                  tabIndex={-1}
                                >
                                  {showRepeatPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                              </div>
                              {repeatPassword && repeatPassword !== newPassword && (
                                <p className="text-[10px] text-rose-500 font-bold mt-0.5">Passwords do not match</p>
                              )}
                              {repeatPassword && repeatPassword === newPassword && (
                                <p className="text-[10px] text-emerald-500 font-bold mt-0.5">Passwords match ✓</p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => {
                                if (!currentPassword || !newPassword || !repeatPassword) {
                                  showToast("Please fill in all password fields.", "error");
                                  return;
                                }
                                if (newPassword !== repeatPassword) {
                                  showToast("New passwords do not match.", "error");
                                  return;
                                }
                                if (newPassword.length < 6) {
                                  showToast("New password must be at least 6 characters.", "error");
                                  return;
                                }
                                setCurrentPassword("");
                                setNewPassword("");
                                setRepeatPassword("");
                                showToast("Password updated successfully.");
                              }}
                              className="w-full py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-teal-brand text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
                            >
                              Update Password
                            </button>
                          </div>
                        </div>

                        {/* 2FA Shield Protection */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Fingerprint className="w-4 h-4 text-teal-brand" />
                            Two-Factor Authentication (2FA)
                          </h3>

                          <div className="space-y-4">
                            <p className="text-[11px] leading-relaxed text-slate-500">
                              Enhance security on your admin account by requiring a second verification step alongside your password. Choose your preferred method below.
                            </p>

                            {/* Method Selector Tabs */}
                            <div className="flex gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                              <button
                                type="button"
                                onClick={() => { setTwoFAMethod("app"); setShow2FAQr(false); setEmailOtpSent(false); }}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                  twoFAMethod === "app"
                                    ? "bg-white dark:bg-slate-800 text-teal-brand shadow-sm"
                                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                }`}
                              >
                                📱 Authenticator App
                              </button>
                              <button
                                type="button"
                                onClick={() => { setTwoFAMethod("email"); setShow2FAQr(false); setEmailOtpSent(false); }}
                                className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                  twoFAMethod === "email"
                                    ? "bg-white dark:bg-slate-800 text-teal-brand shadow-sm"
                                    : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                }`}
                              >
                                ✉️ Email OTP
                              </button>
                            </div>

                            {/* Authenticator App Method */}
                            {twoFAMethod === "app" && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">Authenticator Code App</p>
                                    <span className="text-[10px] text-slate-400">Google Authenticator or Duo Security</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (is2FAEnabled && twoFAMethod === "app") {
                                        setIs2FAEnabled(false);
                                        setShow2FAQr(false);
                                        showToast("Two-Factor Authentication is now disabled.", "info");
                                      } else {
                                        setShow2FAQr(true);
                                      }
                                    }}
                                    className={`py-1.5 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                                      is2FAEnabled && twoFAMethod === "app"
                                        ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white"
                                        : "bg-teal-brand text-white hover:opacity-90"
                                    }`}
                                  >
                                    {is2FAEnabled && twoFAMethod === "app" ? "Disable" : "Configure"}
                                  </button>
                                </div>

                                {show2FAQr && (() => {
                                  const platformName = "Daily Impact Devotional";
                                  const adminName = users[0]?.name || "Admin";
                                  const label = `${platformName} (${adminName})`;
                                  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
                                  // Reuse existing secret or generate a new one for this session
                                  let secret = dashboardSettings.totp_secret;
                                  if (!secret || secret.length < 16) {
                                    secret = "";
                                    for (let i = 0; i < 16; i++) secret += chars[Math.floor(Math.random() * chars.length)];
                                  }
                                  // TOTP URI: issuer is the platform name, account is admin name
                                  const totpUrl = `otpauth://totp/${encodeURIComponent(platformName)}:${encodeURIComponent(adminName)}?secret=${secret}&issuer=${encodeURIComponent(platformName)}`;
                                  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totpUrl)}`;
                                  return (
                                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 text-center space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                      <span className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Scan with your authenticator app</span>
                                      <div className="w-36 h-36 border p-1 bg-white rounded-lg mx-auto flex items-center justify-center overflow-hidden">
                                        <img src={qrUrl} alt="2FA QR Code" className="w-full h-full object-contain" crossOrigin="anonymous" />
                                      </div>
                                      <p className="text-[10px] font-mono font-bold text-teal-400 uppercase tracking-widest break-all px-2">
                                        {secret.match(/.{1,4}/g)?.join(" ") || secret}
                                      </p>
                                      <p className="text-[9px] text-slate-500">
                                        App will show: <strong className="text-slate-300">{platformName}</strong> — <strong className="text-teal-400">{adminName}</strong>
                                      </p>
                                      <div className="pt-1 flex justify-center gap-2">
                                        <button type="button" onClick={() => setShow2FAQr(false)}
                                          className="py-1 px-3 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-bold uppercase tracking-wider">
                                          Cancel
                                        </button>
                                        <button type="button" onClick={() => { setIs2FAEnabled(true); setShow2FAQr(false); showToast(`2FA activated for ${adminName}!`); }}
                                          className="py-1 px-3 bg-teal-brand text-white rounded text-[10px] font-black uppercase tracking-wider">
                                          Activate
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Email OTP Method */}
                            {twoFAMethod === "email" && (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                                  <div>
                                    <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">Email One-Time Password</p>
                                    <span className="text-[10px] text-slate-400">{changeEmail}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (is2FAEnabled && twoFAMethod === "email") {
                                        setIs2FAEnabled(false);
                                        setEmailOtpSent(false);
                                        setEmailOtpValue("");
                                        showToast("Email OTP 2FA is now disabled.", "info");
                                      } else {
                                        setEmailOtpSent(true);
                                        setEmailOtpValue("");
                                        showToast(`OTP sent to ${changeEmail}`, "success");
                                      }
                                    }}
                                    className={`py-1.5 px-3.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${
                                      is2FAEnabled && twoFAMethod === "email"
                                        ? "bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white"
                                        : "bg-teal-brand text-white hover:opacity-90"
                                    }`}
                                  >
                                    {is2FAEnabled && twoFAMethod === "email" ? "Disable" : "Send OTP"}
                                  </button>
                                </div>

                                {emailOtpSent && !is2FAEnabled && (
                                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider text-center">
                                      Enter the 6-digit OTP sent to your email
                                    </p>
                                    <input
                                      type="text"
                                      maxLength={6}
                                      placeholder="000000"
                                      value={emailOtpValue}
                                      onChange={(e) => setEmailOtpValue(e.target.value.replace(/\D/g, ""))}
                                      className={`w-full py-2.5 px-4 text-center text-lg font-mono font-black border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 tracking-[0.5em] ${
                                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
                                      }`}
                                    />
                                    <div className="flex justify-center gap-2">
                                      <button type="button" onClick={() => { setEmailOtpSent(false); setEmailOtpValue(""); }}
                                        className="py-1 px-3 bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded text-[10px] font-bold uppercase tracking-wider">
                                        Cancel
                                      </button>
                                      <button type="button" onClick={() => {
                                        if (emailOtpValue.length !== 6) {
                                          showToast("Please enter the full 6-digit OTP.", "error");
                                          return;
                                        }
                                        setIs2FAEnabled(true);
                                        setEmailOtpSent(false);
                                        setEmailOtpValue("");
                                        showToast("Email OTP Two-Factor Authentication activated!");
                                      }}
                                        className="py-1 px-3 bg-teal-brand text-white rounded text-[10px] font-black uppercase tracking-wider">
                                        Verify & Activate
                                      </button>
                                    </div>
                                    <p className="text-[9px] text-center text-slate-400 font-bold">
                                      Didn't receive it?{" "}
                                      <button type="button" onClick={() => showToast(`OTP resent to ${changeEmail}`, "success")}
                                        className="text-teal-brand underline">Resend OTP</button>
                                    </p>
                                  </div>
                                )}

                                {is2FAEnabled && twoFAMethod === "email" && (
                                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 shrink-0" />
                                    Email OTP 2FA is active. A code will be sent to {changeEmail} on every login.
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Active 2FA Status Badge */}
                            {is2FAEnabled && (
                              <div className="p-3 rounded-xl bg-teal-brand/10 border border-teal-brand/20 text-teal-brand text-[10px] font-bold flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 shrink-0" />
                                2FA is currently enabled via {twoFAMethod === "app" ? "Authenticator App" : "Email OTP"}.
                              </div>
                            )}
                          </div>
                        </div>

                        {/* IP Ban Management */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Ban className="w-4 h-4 text-teal-brand" />
                            IP Ban Management
                          </h3>

                          <div className="space-y-4">
                            <p className="text-[11px] leading-relaxed text-slate-500">
                              Manage IP address bans for security. Bans affect entire IP subnets and stay active until you unban them here — they do not expire automatically.
                            </p>

                            {/* Create New Ban Form */}
                            <form onSubmit={handleCreateIpBan} className="space-y-3">
                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">IP Address to Ban</label>
                                <input
                                  type="text"
                                  placeholder="e.g., 192.168.1.1"
                                  value={newBanIp}
                                  onChange={(e) => setNewBanIp(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Reason (optional)</label>
                                <input
                                  type="text"
                                  placeholder="e.g., Suspicious activity"
                                  value={newBanReason}
                                  onChange={(e) => setNewBanReason(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Associated Email (optional)</label>
                                <input
                                  type="email"
                                  placeholder="e.g., user@example.com"
                                  value={newBanEmail}
                                  onChange={(e) => setNewBanEmail(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={isCreatingBan}
                                className="w-full py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-rose-500 text-white hover:bg-rose-600 transition-opacity active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isCreatingBan ? "Creating Ban..." : "Create IP Ban"}
                              </button>
                            </form>

                            {/* Existing Bans List */}
                            <div className="space-y-2">
                              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Active Bans ({ipBans.filter(b => b.active).length})</span>
                              <div className="max-h-48 overflow-y-auto space-y-2">
                                {ipBans.filter(b => b.active).length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic py-2">No active IP bans</p>
                                ) : (
                                  ipBans.filter(b => b.active).map((ban) => (
                                    <div key={ban.id} className={`p-3 rounded-lg border ${
                                      isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                                    }`}>
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{ban.ipAddress}</p>
                                          <p className="text-[10px] text-slate-500 truncate">CIDR: {ban.cidr}</p>
                                          <p className="text-[10px] text-slate-400 truncate">{ban.reason}</p>
                                          {ban.email && <p className="text-[10px] text-slate-400 truncate">Email: {ban.email}</p>}
                                        </div>
                                        <button
                                          onClick={() => handleRemoveIpBan(ban.id)}
                                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors"
                                          title="Unban IP"
                                        >
                                          <CheckCircle className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            {/* Failed Login Track — recent unsuccessful attempts */}
                            <div className="space-y-2">
                              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Failed Login Track ({failedLogins.length} recent)</span>
                              <div className="max-h-44 overflow-y-auto space-y-1.5">
                                {failedLogins.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic py-2">No failed login attempts recorded.</p>
                                ) : (
                                  failedLogins.slice(0, 25).map((log) => {
                                    const ipMatch = ipBans.find(b => b.active && (b.ipAddress === log.ip || (log.ip && b.cidr && log.ip.startsWith(b.cidr.split("/")[0]))));
                                    return (
                                      <div key={log.id} className={`p-2.5 rounded-lg border flex items-start justify-between gap-2 ${
                                        isDarkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                                      }`}>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{log.email || "(no email)"}</p>
                                          <p className="text-[9px] font-mono text-slate-500 truncate">{log.ip} • {new Date(log.timestamp).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                                          <p className="text-[9px] text-slate-400 truncate">{log.location || "Location unknown"}</p>
                                        </div>
                                        {ipMatch ? (
                                          <button
                                            onClick={() => handleRemoveIpBan(ipMatch.id)}
                                            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-colors shrink-0"
                                            title={`Unban ${log.ip}`}
                                          >
                                            <CheckCircle className="w-3.5 h-3.5" />
                                          </button>
                                        ) : null}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Tab 3: Branding & Assets */}
                    {settingsSubTab === "assets" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-200">
                        
                        {/* Homepage Hero section image card */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Image className="w-4 h-4 text-teal-brand" />
                            Homepage Hero Banner
                          </h3>
                          
                          <p className="text-[11px] leading-relaxed text-slate-500">
                            Configure a static, high-resolution header background image specifically for the homepage top section.
                          </p>

                          {/* Current Banner Preview */}
                          <div className="space-y-2">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Current Background:</span>
                            {homepageHeroImage ? (
                              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 aspect-[3/1]">
                                <img 
                                  src={homepageHeroImage} 
                                  alt="Custom Homepage Hero" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 bg-black/10 hover:bg-black/35 transition-colors flex items-center justify-center group">
                                  <button
                                    type="button"
                                    onClick={resetHeroImage}
                                    className="py-1.5 px-3 bg-black/85 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all active:scale-95"
                                    title="Reset to default banner"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Reset to Default
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center bg-slate-50 dark:bg-slate-950/30">
                                <p className="text-[11px] font-bold text-slate-400 italic">Default Daily Impact Banner Active</p>
                                <p className="text-[9px] text-slate-400/80 mt-1">"Dec-Devotional-Joy-and-Strength.jpg" is currently used.</p>
                              </div>
                            )}
                          </div>

                          {/* Upload Field */}
                          <div className="space-y-1">
                            <label className="text-slate-500 block">Upload New Hero Image</label>
                            <div className="relative">
                              <input
                                type="file"
                                id="settings-hero-img-input"
                                accept="image/*"
                                onChange={handleHeroImageChange}
                                className="hidden"
                              />
                              <label
                                htmlFor="settings-hero-img-input"
                                className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer hover:border-teal-brand hover:bg-teal-brand/5 transition-all text-center ${
                                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
                                }`}
                              >
                                <UploadCloud className="w-5 h-5 text-slate-400" />
                                <div className="text-left">
                                  <span className="text-xs font-bold text-teal-brand block">Select New Banner</span>
                                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider block mt-0.5">PNG, JPG, WEBP (Max 3MB)</span>
                                </div>
                              </label>
                            </div>

                            {/* Recommended sizes — helps users pick an image that fills
                                the responsive hero without awkward cropping on any device. */}
                            <div className={`rounded-xl border p-3 space-y-1.5 ${
                              isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
                            }`}>
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                                <Ruler className="w-3 h-3" /> Recommended Size (W × H)
                              </p>
                              <ul className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 space-y-1">
                                <li className="flex justify-between gap-2"><span>Desktop</span><span className="font-mono">1920 × 640 px</span></li>
                                <li className="flex justify-between gap-2"><span>Tablet</span><span className="font-mono">1024 × 400 px</span></li>
                                <li className="flex justify-between gap-2"><span>Mobile</span><span className="font-mono">750 × 320 px</span></li>
                              </ul>
                              <p className="text-[9px] text-slate-400 leading-relaxed">
                                Wide landscape banners crop best. The section scales with the screen — a 16:9 or wider image keeps the centre visible on every device.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Footer Sponsor Card Image */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Heart className="w-4 h-4 text-teal-brand" />
                            Footer Sponsor Card Image
                          </h3>
                          <p className="text-[11px] leading-relaxed text-slate-500">
                            This image appears on the footer's "Sponsor Devotionals" card with the donate button overlaid on it.
                          </p>
                          <div className="space-y-2">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Current Image:</span>
                            {footerSponsorImage ? (
                              <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[4/3]">
                                <img src={footerSponsorImage} alt="Sponsor Card" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                <div className="absolute inset-0 bg-black/10 hover:bg-black/35 transition-colors flex items-center justify-center">
                                  <button type="button" onClick={async () => {
                                    setFooterSponsorImage("");
                                    setDashboardSettings(prev => ({ ...prev, footer_sponsor_image: "" }));
                                    try {
                                      await apiPut(`${API_BASE}/settings.php`, { footer_sponsor_image: "" });
                                      showToast("Sponsor image reset to default.", "success");
                                    } catch {
                                      showToast("Reset saved locally — server unreachable.", "error");
                                    }
                                  }}
                                    className="py-1.5 px-3 bg-black/85 hover:bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all">
                                    <Trash2 className="w-3.5 h-3.5" /> Reset
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center bg-slate-50 dark:bg-slate-950/30">
                                <p className="text-[11px] font-bold text-slate-400 italic">Using default hero image as fallback</p>
                              </div>
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-slate-500 block">Upload Sponsor Card Image</label>
                            <div className="relative">
                              <input type="file" id="footer-sponsor-img-input" accept="image/*" onChange={handleFooterSponsorImageChange} className="hidden" />
                              <label htmlFor="footer-sponsor-img-input"
                                className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer hover:border-teal-brand hover:bg-teal-brand/5 transition-all ${
                                  isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-slate-50"
                                }`}>
                                <UploadCloud className="w-5 h-5 text-slate-400" />
                                <div className="text-left">
                                  <span className="text-xs font-bold text-teal-brand block">Select Image</span>
                                  <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">PNG, JPG, WEBP</span>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Ministries Connections & Homepage Assets */}
                        <div className={`p-6 rounded-2xl border space-y-5 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4 text-teal-brand" />
                            Homepage Pastor & Telegram Assets
                          </h3>

                          <p className="text-[11px] leading-relaxed text-slate-500">
                            Configure the primary pastor portrait image, the Telegram channel link, and the Telegram QR code displayed in the sidebar of the homepage.
                          </p>

                          {/* Pastor Portrait Asset */}
                          <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">1. Pastor's Portrait Image</span>
                            
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 flex-shrink-0">
                                <img 
                                  src={pastorPortrait || "/assets/images/dr-andy-osakwe.jpg"} 
                                  alt="Pastor Portrait Preview" 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex-1 space-y-2">
                                <input
                                  type="file"
                                  id="settings-pastor-portrait-input"
                                  accept="image/*"
                                  onChange={handlePastorPortraitChange}
                                  className="hidden"
                                />
                                <div className="flex gap-2">
                                  <label
                                    htmlFor="settings-pastor-portrait-input"
                                    className="py-1.5 px-3 bg-teal-brand text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer hover:opacity-90 active:scale-95 transition-all inline-block"
                                  >
                                    Upload Portrait
                                  </label>
                                  {pastorPortrait && (
                                    <button
                                      type="button"
                                      onClick={resetPastorPortrait}
                                      className="py-1.5 px-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-400">Recommended: portrait aspect ratio (e.g. 3:4)</p>
                              </div>
                            </div>
                          </div>

                          {/* Telegram Link Asset */}
                          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">2. Telegram Channel Link</span>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={telegramLink}
                                onChange={(e) => setTelegramLink(e.target.value)}
                                placeholder="https://t.me/dailyimpactdevotional"
                                className={`w-full py-2 px-3 border rounded-xl focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`}
                              />
                              <button
                                type="button"
                                onClick={saveTelegramLink}
                                className="py-2 px-4 bg-teal-brand text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shrink-0"
                              >
                                Save Link
                              </button>
                            </div>
                          </div>

                          {/* Telegram QR Code Asset */}
                          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">3. Telegram Scan QR Code</span>
                            
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-16 rounded-xl p-1 overflow-hidden border border-slate-200 dark:border-slate-800 bg-white flex-shrink-0 flex items-center justify-center">
                                <img 
                                  src={telegramQr || "/assets/images/dailyImpactQrcode.jpeg"} 
                                  alt="Telegram QR Preview" 
                                  className="max-w-full max-h-full object-contain"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex-1 space-y-2">
                                <input
                                  type="file"
                                  id="settings-telegram-qr-input"
                                  accept="image/*"
                                  onChange={handleTelegramQrChange}
                                  className="hidden"
                                />
                                <div className="flex gap-2">
                                  <label
                                    htmlFor="settings-telegram-qr-input"
                                    className="py-1.5 px-3 bg-teal-brand text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer hover:opacity-90 active:scale-95 transition-all inline-block"
                                  >
                                    Upload QR Code
                                  </label>
                                  {telegramQr && (
                                    <button
                                      type="button"
                                      onClick={resetTelegramQr}
                                      className="py-1.5 px-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-400">Recommended: square image containing QR code</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Author Page Card */}
                        <div className={`p-6 rounded-2xl border space-y-5 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-teal-brand" />
                            Author Page
                          </h3>
                          <p className="text-[11px] leading-relaxed text-slate-500">
                            Configure the public Author page accessible from the footer.
                          </p>

                          {/* Author Image */}
                          <div className="space-y-2">
                            <span className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Author Photo</span>
                            <div className="flex items-center gap-4">
                              <div className="w-16 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 shrink-0">
                                <img
                                  src={authorImage || dashboardSettings.pastor_portrait_image || "/assets/images/dr-andy-osakwe.jpg"}
                                  alt="Author"
                                  className="w-full h-full object-cover object-top"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="space-y-2">
                                <input type="file" id="author-image-input" accept="image/*" onChange={handleAuthorImageChange} className="hidden" />
                                <div className="flex gap-2">
                                  <label htmlFor="author-image-input" className="py-1.5 px-3 bg-teal-brand text-white rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer hover:opacity-90 transition-all inline-block">
                                    Upload Photo
                                  </label>
                                  {authorImage && (
                                    <button type="button" onClick={async () => {
                                      setAuthorImage("");
                                      setDashboardSettings(prev => ({ ...prev, author_image: "" }));
                                      try {
                                        await apiPut(`${API_BASE}/settings.php`, { author_image: "" });
                                        showToast("Author image reset to default.", "success");
                                      } catch {
                                        showToast("Reset saved locally — server unreachable.", "error");
                                      }
                                    }}
                                      className="py-1.5 px-3 bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all">
                                      Reset
                                    </button>
                                  )}
                                </div>
                                <p className="text-[9px] text-slate-400">Portrait ratio recommended (e.g. 3:4)</p>
                              </div>
                            </div>
                          </div>

                          {/* Author Name & Title */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Full Name</label>
                              <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)}
                                className={`w-full py-2 px-3 border rounded-xl text-xs focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`} />
                            </div>
                            <div className="space-y-1">
                              <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Title / Role</label>
                              <input type="text" value={authorTitle} onChange={(e) => setAuthorTitle(e.target.value)}
                                className={`w-full py-2 px-3 border rounded-xl text-xs focus:outline-none ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`} />
                            </div>
                          </div>

                          {/* Author Bio */}
                          <div className="space-y-1">
                            <label className="block text-[10px] uppercase text-slate-400 font-bold tracking-wider">Biography</label>
                            <textarea rows={5} value={authorBio} onChange={(e) => setAuthorBio(e.target.value)}
                              placeholder="Write the author's full biography here..."
                              className={`w-full py-2 px-3 border rounded-xl text-xs focus:outline-none leading-relaxed ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`} />
                          </div>

                          <button type="button" onClick={saveAuthorDetails}
                            className="py-2 px-4 bg-teal-brand text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all">
                            Save Author Details
                          </button>
                        </div>

                      </div>
                    )}

                    {/* Tab 4: Email Notifications & Login Audit */}
                    {settingsSubTab === "email" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in duration-200">
                        
                        {/* Email Configuration */}
                        <div className={`p-6 rounded-2xl border space-y-4 ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                        }`}>
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Mail className="w-4 h-4 text-teal-brand" />
                            Email Configuration
                          </h3>

                          <div className="space-y-4">
                            <p className="text-[11px] leading-relaxed text-slate-500">
                              Configure email delivery methods. Resend is recommended as primary, SMTP as backup.
                            </p>

                            {/* Mail Method Selection */}
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Primary Email Method</label>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEmailConfig({ ...emailConfig, mailMethod: 'resend' })}
                                  className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    emailConfig.mailMethod === 'resend'
                                      ? 'bg-teal-brand text-white'
                                      : isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  Resend API
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEmailConfig({ ...emailConfig, mailMethod: 'smtp' })}
                                  className={`flex-1 py-2 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    emailConfig.mailMethod === 'smtp'
                                      ? 'bg-teal-brand text-white'
                                      : isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  SMTP
                                </button>
                              </div>
                            </div>

                            {/* Resend Configuration */}
                            {emailConfig.mailMethod === 'resend' && (
                              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Resend API Key</label>
                                  <input
                                    type="password"
                                    placeholder="re_xxxxxxxxxxxx"
                                    value={emailConfig.resend.apiKey}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, resend: { ...emailConfig.resend, apiKey: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">From Email</label>
                                  <input
                                    type="email"
                                    placeholder="noreply@dailyimpact.devotional"
                                    value={emailConfig.resend.fromEmail}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, resend: { ...emailConfig.resend, fromEmail: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">From Name</label>
                                  <input
                                    type="text"
                                    placeholder="Daily Impact Devotional"
                                    value={emailConfig.resend.fromName}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, resend: { ...emailConfig.resend, fromName: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Reply-To Email</label>
                                  <input
                                    type="email"
                                    placeholder="admin@dailyimpact.devotional"
                                    value={emailConfig.resend.replyTo}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, resend: { ...emailConfig.resend, replyTo: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                              </div>
                            )}

                            {/* SMTP Configuration */}
                            {emailConfig.mailMethod === 'smtp' && (
                              <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">SMTP Host</label>
                                  <input
                                    type="text"
                                    placeholder="smtp.gmail.com"
                                    value={emailConfig.smtp.host}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, host: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">SMTP Username</label>
                                  <input
                                    type="text"
                                    placeholder="your@email.com"
                                    value={emailConfig.smtp.user}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, user: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">SMTP Password</label>
                                  <input
                                    type="password"
                                    placeholder="••••••••"
                                    value={emailConfig.smtp.pass}
                                    onChange={(e) => setEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, pass: e.target.value } })}
                                    className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                      isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                    }`}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Port</label>
                                    <input
                                      type="text"
                                      placeholder="587"
                                      value={emailConfig.smtp.port}
                                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, port: e.target.value } })}
                                      className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                      }`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Security</label>
                                    <select
                                      value={emailConfig.smtp.secure}
                                      onChange={(e) => setEmailConfig({ ...emailConfig, smtp: { ...emailConfig.smtp, secure: e.target.value } })}
                                      className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                        isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                      }`}
                                    >
                                      <option value="tls">TLS</option>
                                      <option value="ssl">SSL</option>
                                      <option value="none">None</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Security Notification Emails */}
                            <div className="space-y-1 pt-3 border-t border-slate-100 dark:border-slate-800">
                              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block">Security Notification Emails</label>
                              <input
                                type="text"
                                placeholder="admin1@example.com, admin2@example.com"
                                value={emailConfig.notifyEmails}
                                onChange={(e) => setEmailConfig({ ...emailConfig, notifyEmails: e.target.value })}
                                className={`w-full py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                  isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                }`}
                              />
                              <p className="text-[9px] text-slate-400">Comma-separated list of admin emails to receive security alerts</p>
                            </div>

                            <button
                              type="button"
                              onClick={handleSaveEmailConfig}
                              className="w-full py-2.5 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-teal-brand text-white hover:opacity-90 transition-opacity active:scale-[0.98]"
                            >
                              Save Email Configuration
                            </button>
                          </div>
                        </div>

                        {/* Test Email & Login Audit */}
                        <div className="space-y-6">
                          {/* Test Email */}
                          <div className={`p-6 rounded-2xl border space-y-4 ${
                            isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                          }`}>
                            <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <Send className="w-4 h-4 text-teal-brand" />
                              Test Email Configuration
                            </h3>

                            <div className="space-y-3">
                              <p className="text-[11px] leading-relaxed text-slate-500">
                                Send a test email to verify your configuration is working correctly.
                              </p>
                              <div className="flex gap-2">
                                <input
                                  type="email"
                                  placeholder="your@email.com"
                                  value={testEmail}
                                  onChange={(e) => setTestEmail(e.target.value)}
                                  className={`flex-1 py-2 pl-3 pr-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-brand/20 text-sm ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                                <button
                                  type="button"
                                  onClick={handleTestEmail}
                                  disabled={isSendingTestEmail}
                                  className="py-2 px-4 rounded-xl uppercase tracking-wider text-[11px] font-black bg-teal-brand text-white hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isSendingTestEmail ? "Sending..." : "Send Test"}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Login Audit Panel */}
                          <EmailAuditPanel isDarkMode={isDarkMode} showToast={showToast} />
                        </div>

                      </div>
                    )}

                    {/* Tab 5: Payments & Donations Settings */}
                    {settingsSubTab === "payments" && (
                      <DonationSettings isDarkMode={isDarkMode} onShowToast={showToast} />
                    )}

                  </div>
                </div>
              )}

              {/* VIEW 7: TELEGRAM AUTOMATION PORTAL */}
              {activeTab === "telegram-integration" && (
                <div className="space-y-6">
                  
                  {/* Page Header */}
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
                          <Send className="w-6 h-6 text-teal-brand" />
                          <span className="text-black dark:text-white">Telegram Channel Automation</span>
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                          Simultaneously broadcast daily devotionals with high-definition hero covers straight to your Telegram channel subscribers.
                        </p>
                      </div>

                      {/* Cron setup + Enabled Indicator toggle */}
                      <div className="flex items-center gap-3 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => setCronModalOpen(true)}
                          className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider hover:bg-amber-500/10 transition-all"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          Cron Setup
                        </button>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${telegramEnabled ? "text-emerald-500" : "text-slate-400"}`}>
                          {telegramEnabled ? "● Service Active" : "○ Service Paused"}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const val = !telegramEnabled;
                            setTelegramEnabled(val);
                            // Persist immediately so the switch survives reload.
                            writeTgCache({ telegram_enabled: val ? "true" : "false" });
                            apiPut(`${API_BASE}/settings.php`, { telegram_enabled: val ? "true" : "false" }).catch(() => {});
                            showToast(val ? "Telegram Automation enabled!" : "Telegram Automation paused.", "info");
                          }}
                          className={`w-11 h-6 rounded-full p-0.5 transition-colors focus:outline-none ${
                            telegramEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-800"
                          }`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                            telegramEnabled ? "translate-x-5" : "translate-x-0"
                          }`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Config & Simulation Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Left Panel: Configuration Form (7 columns) */}
                    <div className="lg:col-span-7 space-y-6">
                      <form onSubmit={handleSaveTelegramConfig} className={`p-6 rounded-2xl border space-y-5 text-xs font-semibold ${
                        isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                      }`}>
                        
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                          <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <Settings className="w-4 h-4 text-teal-brand" />
                            API Credentials & Gateway
                          </h3>
                          <span className="text-[9px] bg-sky-500/10 text-sky-500 px-2 py-0.5 rounded font-black uppercase tracking-wider">
                            Telegram Bot API
                          </span>
                        </div>

                        {/* Telegram Bot Token input */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center">
                            <label className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                              Bot API Token
                            </label>
                            <a 
                              href="https://t.me/BotFather" 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-[9px] text-teal-brand font-black uppercase tracking-widest hover:underline"
                            >
                              Get via @BotFather ↗
                            </a>
                          </div>
                          <div className="relative">
                            <input
                              type={telegramShowToken ? "text" : "password"}
                              value={telegramBotToken}
                              onChange={(e) => setTelegramBotToken(e.target.value)}
                              placeholder="e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                              className={`w-full py-2.5 pl-3 pr-10 border rounded-xl focus:outline-none ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => setTelegramShowToken(!telegramShowToken)}
                              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                            Create a bot on Telegram, copy the API Token, and paste it here.
                          </p>
                        </div>

                        {/* Telegram Channel ID input */}
                        <div className="space-y-1">
                          <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            Telegram Channel Username / ID
                          </label>
                          <input
                            type="text"
                            value={telegramChannelId}
                            onChange={(e) => setTelegramChannelId(e.target.value)}
                            placeholder="e.g. @dailyimpactdevotional or -100123456789"
                            className={`w-full py-2.5 px-3 border rounded-xl focus:outline-none ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                            }`}
                          />
                          <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                            Specify your channel username starting with <b>@</b>. Make sure your Telegram bot is added as an <b>Administrator</b> in your channel with post permissions.
                          </p>
                        </div>

                        {/* Verify Connection Button */}
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            disabled={isVerifying || !telegramBotToken || !telegramChannelId}
                            onClick={async () => {
                              setIsVerifying(true);
                              setTelegramVerifyResult(null);
                              try {
                                const res = await fetch(`${API_BASE}/telegram.php?action=verify`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ botToken: telegramBotToken, channelId: telegramChannelId }),
                                });
                                const data = await res.json() as { success: boolean; botName?: string; channelTitle?: string; error?: string };
                                setTelegramVerifyResult(data);
                                if (data.success) showToast(`✅ Connected! Bot: @${data.botName} → Channel: ${data.channelTitle}`, "success");
                                else showToast(`❌ ${data.error}`, "error");
                              } catch {
                                setTelegramVerifyResult({ success: false, error: "API server not running. Start with: npm run server" });
                                showToast("API server not running. Start with: npm run server", "error");
                              }
                              setIsVerifying(false);
                            }}
                            className="w-full py-2 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider border border-teal-brand text-teal-brand hover:bg-teal-brand hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                          >
                            {isVerifying ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Verifying...</> : <><ShieldCheck className="w-3.5 h-3.5" /> Verify Bot & Channel Connection</>}
                          </button>

                          {telegramVerifyResult && (
                            <div className={`p-3 rounded-xl text-[11px] font-semibold border ${
                              telegramVerifyResult.success
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                                : "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400"
                            }`}>
                              {telegramVerifyResult.success
                                ? `✅ Bot "${telegramVerifyResult.botName}" connected to channel "${telegramVerifyResult.channelTitle}"`
                                : `❌ ${telegramVerifyResult.error}`}
                            </div>
                          )}
                        </div>

                        {/* Daily Post Scheduling Options */}
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-4">
                          
                          {/* Post mode selector */}
                          <div className="space-y-1">
                            <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                              Publish Trigger Mode
                            </label>
                            <select
                              value={telegramScheduleMode}
                              onChange={(e) => setTelegramScheduleMode(e.target.value)}
                              className={`w-full py-2 px-2.5 border rounded-xl focus:outline-none ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`}
                            >
                              <option value="scheduled">Daily Scheduled Time</option>
                              <option value="immediate">Immediately Upon Upload</option>
                              <option value="manual">Manual Push Only</option>
                            </select>
                          </div>

                          {/* Time select */}
                          {telegramScheduleMode === "scheduled" && (
                            <div className="space-y-1">
                              <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                                Auto Broadcast Time
                              </label>
                              <div className="relative">
                                <input
                                  type="time"
                                  value={telegramPostTime}
                                  onChange={(e) => setTelegramPostTime(e.target.value)}
                                  className={`w-full py-2 pl-3 pr-8 border rounded-xl focus:outline-none ${
                                    isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                                  }`}
                                />
                                <Clock className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Automated Signature Footer Text */}
                        <div className="space-y-1">
                          <label className="block text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            Telegram Message Footer Signature
                          </label>
                          <textarea
                            rows={3}
                            value={telegramFooterText}
                            onChange={(e) => setTelegramFooterText(e.target.value)}
                            className={`w-full py-2 px-3 border rounded-xl focus:outline-none font-sans leading-relaxed ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                            }`}
                            placeholder="Add links, invitations or QR information..."
                          />
                          <p className="text-[9px] text-slate-400 font-medium leading-relaxed">
                            This text is automatically appended below the devotional paragraphs when sent to your channel. Supports markdown-style links.
                          </p>
                        </div>

                        {/* Save Button */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                          <button
                            type="submit"
                            className="py-2.5 px-5 bg-teal-brand text-white rounded-xl text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all"
                          >
                            Save Settings Configuration
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Right Panel: Live Connection Testing & Terminal logs (5 columns) */}
                    <div className="lg:col-span-5 space-y-6">
                      
                      {/* Connection Test Console Card */}
                      <div className={`p-6 rounded-2xl border space-y-4 ${
                        isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                      }`}>
                        <h3 className="font-serif text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5 border-b border-slate-150 dark:border-slate-800 pb-2.5">
                          <RefreshCw className="w-4 h-4 text-teal-brand" />
                          Live Broadcast Testbed
                        </h3>

                        <p className="text-[11px] leading-relaxed text-slate-500">
                          Verify your bot tokens and channel connections before turning on live scheduler. Select any uploaded devotional to run a trial send.
                        </p>

                        {/* Month / Year filter for the testbed */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Month</label>
                            <select
                              value={tbMonth}
                              onChange={(e) => { setTbMonth(e.target.value); setSelectedTestDevId(""); }}
                              className={`w-full py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`}
                            >
                              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Year</label>
                            <select
                              value={tbYear}
                              onChange={(e) => { setTbYear(parseInt(e.target.value, 10)); setSelectedTestDevId(""); }}
                              className={`w-full py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
                                isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                              }`}
                            >
                              {Array.from(new Set([...devotionals.map(d => d.year), new Date().getFullYear(), new Date().getFullYear() + 1])).sort((a, b) => b - a).map(y => (
                                <option key={y} value={y}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Devotional picker (shows the selected month/year only) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                            Select Devotional to Broadcast
                          </label>
                          <select
                            value={selectedTestDevId}
                            onChange={(e) => setSelectedTestDevId(e.target.value)}
                            className={`w-full py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                            }`}
                          >
                            <option value="">-- Choose Devotional --</option>
                            {tbDevotionals.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.date} - {d.title}
                              </option>
                            ))}
                            {tbDevotionals.length === 0 && (
                              <option value="" disabled>No devotionals for {tbMonth} {tbYear}</option>
                            )}
                          </select>
                        </div>

                        {/* Test action trigger button */}
                        <button
                          type="button"
                          disabled={isTestingTelegram || !selectedTestDevId}
                          onClick={handleTestTelegramPost}
                          className={`w-full py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                            isTestingTelegram || !selectedTestDevId
                              ? "bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed"
                              : "bg-teal-brand text-white hover:opacity-90 active:scale-[0.98]"
                          }`}
                        >
                          <Send className="w-4 h-4" />
                          {isTestingTelegram ? "Transmitting Post Payload..." : "Send Test Broadcast to Channel"}
                        </button>

                        {/* Terminal simulation log feed */}
                        <div className="space-y-1.5">
                          <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">
                            Telemetry Console Terminal
                          </span>
                          <div className="h-56 w-full rounded-xl bg-slate-950 border border-slate-800 p-3 font-mono text-[9px] text-slate-300 overflow-y-auto leading-relaxed space-y-2 select-text scrollbar-thin scrollbar-thumb-slate-800">
                            {telegramConsoleLogs.length > 0 ? (
                              telegramConsoleLogs.map((log, index) => (
                                <div key={`tg-log-${index}`} className="whitespace-pre-wrap border-b border-slate-900/40 pb-1">
                                  {log.includes("Success") ? (
                                    <span className="text-emerald-400">{log}</span>
                                  ) : log.includes("Error") ? (
                                    <span className="text-rose-400 font-bold">{log}</span>
                                  ) : (
                                    <span>{log}</span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="text-slate-500 italic h-full flex items-center justify-center text-center px-4">
                                Waiting for broadcast trigger... Setup Credentials and click "Send Test Broadcast" to view API data exchange steps.
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>

                  {/* Broadcast Scheduler — per-devotional date-based scheduling */}
                  <div className={`p-6 rounded-2xl border space-y-5 ${
                    isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-900"
                  }`}>
                    {/* Header + month/year filter */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-serif text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-teal-brand" />
                          Broadcast Scheduler
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-1 leading-relaxed">
                          Schedule devotionals to drop automatically on their own date at the configured time — no cron slot needed per day.
                          Uploading devotionals auto-schedules them when Telegram is enabled (unless mode is Manual).
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Month</label>
                          <select
                            value={tgSchedMonth}
                            onChange={(e) => setTgSchedMonth(e.target.value)}
                            className={`py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                            }`}
                          >
                            {MONTHS.map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Year</label>
                          <select
                            value={tgSchedYear}
                            onChange={(e) => setTgSchedYear(parseInt(e.target.value, 10))}
                            className={`py-2 px-2.5 border rounded-xl text-xs font-semibold focus:outline-none ${
                              isDarkMode ? "bg-slate-950 border-slate-800 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                            }`}
                          >
                            {Array.from(new Set([...devotionals.map(d => d.year), new Date().getFullYear(), new Date().getFullYear() + 1])).sort((a, b) => b - a).map(y => (
                              <option key={y} value={y}>{y}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => loadTelegramSchedules(tgSchedMonth, tgSchedYear)}
                          disabled={tgSchedLoading}
                          className={`py-2 px-3.5 rounded-xl border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 disabled:opacity-50 ${
                            isDarkMode
                              ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                              : "border-slate-300 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${tgSchedLoading ? "animate-spin" : ""}`} />
                          Refresh
                        </button>
                      </div>
                    </div>

                    {/* Schedule All / summary strip */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wider">
                        <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          {(Object.values(tgSchedMap) as TgScheduleEntry[]).filter(r => r.status === "scheduled").length} Scheduled
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          {(Object.values(tgSchedMap) as TgScheduleEntry[]).filter(r => r.status === "sent").length} Sent
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                          {(Object.values(tgSchedMap) as TgScheduleEntry[]).filter(r => r.status === "failed").length} Failed
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                          {tgUnscheduledIds.length} Unscheduled
                        </span>
                      </div>
                      {tgUnscheduledIds.length > 0 && (
                        <button
                          type="button"
                          disabled={tgSchedBusyId !== ""}
                          onClick={() => tgSchedule(tgUnscheduledIds)}
                          className="self-start inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-teal-brand text-white text-[10px] font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          Schedule All {tgUnscheduledIds.length} for {tgSchedMonth}
                        </button>
                      )}
                    </div>

                    {/* Devotional rows for the selected month/year */}
                    <div className={`rounded-xl border overflow-hidden ${
                      isDarkMode ? "border-slate-800" : "border-slate-200"
                    }`}>
                      {tgMonthDevotionals.length === 0 ? (
                        <p className={`text-center py-8 text-xs font-semibold ${
                          isDarkMode ? "text-slate-500" : "text-slate-400"
                        }`}>
                          No devotionals uploaded for {tgSchedMonth} {tgSchedYear}. Upload some in "Add Devotional" or "Import Devotional" first.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                          {tgMonthDevotionals.map(dev => {
                            const row = tgSchedMap[dev.id];
                            const busy = tgSchedBusyId === dev.id;
                            return (
                              <div key={dev.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 ${
                                isDarkMode ? "bg-slate-900/40" : "bg-white"
                              }`}>
                                {/* Date + title */}
                                <div className="min-w-0 flex-1">
                                  <p className={`text-[10px] font-black uppercase tracking-wider ${
                                    isDarkMode ? "text-slate-500" : "text-slate-400"
                                  }`}>
                                    {dev.date}, {dev.year}
                                  </p>
                                  <p className="font-serif text-sm font-bold text-slate-900 dark:text-white truncate">
                                    {dev.title}
                                  </p>
                                </div>

                                {/* Status badge */}
                                <div className="shrink-0">
                                  {!row ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-slate-200/70 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                      Not scheduled
                                    </span>
                                  ) : row.status === "scheduled" ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400">
                                      <Clock className="w-3 h-3" /> Scheduled @ {row.postTime}
                                    </span>
                                  ) : row.status === "sent" ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                      <CheckCircle className="w-3 h-3" /> Sent {row.sentAt ? `· ${String(row.sentAt).slice(0, 16).replace("T", " ")}` : ""}
                                    </span>
                                  ) : row.status === "failed" ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                      <AlertTriangle className="w-3 h-3" /> Failed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                      Skipped
                                    </span>
                                  )}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 shrink-0">
                                  {(!row || row.status === "failed") && (
                                    <button
                                      type="button"
                                      disabled={busy || tgSchedBusyId !== ""}
                                      onClick={() => tgSchedule([dev.id])}
                                      className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500 hover:text-white transition-all disabled:opacity-40"
                                    >
                                      <Calendar className="w-3 h-3" />
                                      Schedule
                                    </button>
                                  )}
                                  {row?.status === "scheduled" && (
                                    <button
                                      type="button"
                                      disabled={busy || tgSchedBusyId !== ""}
                                      onClick={() => tgUnschedule([dev.id])}
                                      className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white transition-all disabled:opacity-40"
                                    >
                                      <X className="w-3 h-3" />
                                      Unschedule
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    disabled={busy || tgSchedBusyId !== ""}
                                    onClick={() => tgSendNow(dev.id)}
                                    className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[10px] font-black uppercase tracking-wider bg-teal-brand/10 text-teal-brand hover:bg-teal-brand hover:text-white transition-all disabled:opacity-40"
                                  >
                                    <Send className="w-3 h-3" />
                                    Send Now
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── CRON JOB SETUP INSTRUCTION MODAL ── */}
                  {cronModalOpen && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setCronModalOpen(false)}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                      />
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 15 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 15 }}
                        className={`relative w-full max-w-lg rounded-2xl overflow-hidden border shadow-2xl flex flex-col max-h-[90vh] ${
                          isDarkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200 text-slate-950"
                        }`}
                      >
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950/20">
                          <h3 className="font-serif text-base font-black uppercase tracking-tight flex items-center gap-2">
                            <Clock className="w-4.5 h-4.5 text-amber-500" />
                            Automatic Sending — Cron Setup
                          </h3>
                          <button
                            type="button"
                            onClick={() => setCronModalOpen(false)}
                            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-5 text-xs font-semibold leading-relaxed">
                          <p className="text-slate-500 dark:text-slate-400">
                            The scheduler (<code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">backend/api/telegram-cron.php</code>)
                            delivers each scheduled devotional automatically on its own date at the configured time.
                            On your live server it needs a <b>cron job</b> that runs it every minute.
                          </p>

                          {/* Option A: PHP CLI (recommended) */}
                          <div className={`p-4 rounded-xl border space-y-2 ${
                            isDarkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"
                          }`}>
                            <p className="font-black uppercase tracking-wider text-teal-brand text-[10px]">Option A — cPanel (recommended)</p>
                            <ol className="list-decimal list-inside space-y-1.5 text-slate-600 dark:text-slate-300">
                              <li>Log in to cPanel and open <b>Cron Jobs</b>.</li>
                              <li>Set <b>Once Per Minute</b> (<code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">* * * * *</code>).</li>
                              <li>Paste this command (replace <b>USERNAME</b> with your cPanel username):</li>
                            </ol>
                            <div className="flex items-center gap-2 mt-1">
                              <code className="flex-1 font-mono text-[10px] bg-slate-950 text-emerald-400 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-nowrap">
                                php /home/USERNAME/public_html/backend/api/telegram-cron.php
                              </code>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText("php /home/USERNAME/public_html/backend/api/telegram-cron.php").catch(() => {});
                                  setCronCopied(true);
                                  setTimeout(() => setCronCopied(false), 2000);
                                }}
                                className="shrink-0 px-3 py-2.5 rounded-lg border border-teal-brand/20 bg-teal-brand/5 text-teal-brand text-[10px] font-black uppercase tracking-wider hover:bg-teal-brand hover:text-white transition-all"
                              >
                                {cronCopied ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <p className="text-slate-500 dark:text-slate-400">
                              Click <b>Add New Cron Job</b>. Done — devotionals now post themselves at the configured time.
                            </p>
                          </div>

                          {/* Option B: URL */}
                          <div className={`p-4 rounded-xl border space-y-2 ${
                            isDarkMode ? "bg-slate-950/50 border-slate-800" : "bg-slate-50 border-slate-200"
                          }`}>
                            <p className="font-black uppercase tracking-wider text-amber-500 text-[10px]">Option B — URL (any host)</p>
                            <p className="text-slate-600 dark:text-slate-300">
                              If your host cannot run PHP via cron, call the endpoint with curl every minute (replace <b>YOURDOMAIN.com</b>):
                            </p>
                            <code className="block font-mono text-[10px] bg-slate-950 text-emerald-400 border border-slate-800 rounded-lg px-3 py-2.5 overflow-x-auto whitespace-nowrap">
                              curl -s "https://YOURDOMAIN.com/backend/api/telegram-cron.php" &gt;/dev/null 2&gt;&amp;1
                            </code>
                          </div>

                          <div className={`p-3 rounded-xl border ${
                            isDarkMode ? "bg-amber-500/5 border-amber-500/20" : "bg-amber-500/5 border-amber-500/20"
                          }`}>
                            <p className="text-amber-600 dark:text-amber-400 font-bold">
                              ⚠ Before the cron can post:
                            </p>
                            <ul className="list-disc list-inside mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
                              <li>Save your Bot Token + Channel ID and press <b>Verify</b> (must succeed).</li>
                              <li>The <b>Service Active</b> toggle must be ON.</li>
                              <li>Devotionals must be <b>scheduled</b> in the Broadcast Scheduler above (or auto-scheduled on upload).</li>
                            </ul>
                          </div>

                          <button
                            type="button"
                            onClick={() => setCronModalOpen(false)}
                            className="w-full py-2.5 rounded-xl bg-teal-brand text-white text-xs font-black uppercase tracking-widest hover:opacity-90 transition-all"
                          >
                            Got it
                          </button>
                        </div>
                      </motion.div>
                    </div>
                  )}

                  {/* High Fidelity Technical Architecture Explanation for Backend */}
                  <div className={`p-6 rounded-2xl border space-y-4 ${
                    isDarkMode ? "bg-slate-900/50 border-slate-800 text-slate-100" : "bg-slate-50/50 border-slate-200 text-slate-900"
                  }`}>
                    <h3 className="font-serif text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white flex items-center gap-2">
                      <Lock className="w-4 h-4 text-teal-brand" />
                      PHP API Backend & Database Synchronization Guide
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs leading-relaxed font-semibold">
                      
                      {/* Step 1 */}
                      <div className="space-y-2">
                        <span className="text-teal-brand font-black text-sm block">1. Database Storage</span>
                        <p className="text-slate-500">
                          When you export this application, you can store your Telegram credentials in your MySQL/PostgreSQL database using PHP. Set up an <code className="font-mono bg-slate-200/50 dark:bg-slate-800 px-1 rounded text-[10px]">integrations</code> table to persist the Bot Token and Channel ID.
                        </p>
                      </div>

                      {/* Step 2 */}
                      <div className="space-y-2">
                        <span className="text-teal-brand font-black text-sm block">2. Telegram API Script</span>
                        <p className="text-slate-500">
                          Write a lightweight PHP endpoint using <code className="font-mono bg-slate-200/50 dark:bg-slate-800 px-1 rounded text-[10px]">curl</code>. The script compiles the title, reading, body, and issues a multipart request to <code className="font-mono bg-slate-200/50 dark:bg-slate-800 px-1 rounded text-[10px]">sendPhoto</code> to post the image cover and captions together!
                        </p>
                      </div>

                      {/* Step 3 */}
                      <div className="space-y-2">
                        <span className="text-teal-brand font-black text-sm block">3. Cron Job Scheduler</span>
                        <p className="text-slate-500">
                          To support daily automatic schedules without keeping your browser open, configure a 1-minute system <b>cron job</b> on your web server pointing to your PHP broadcast agent script.
                        </p>
                      </div>

                    </div>

                    <div className="pt-2">
                      <p className="text-[10px] text-slate-400 leading-normal font-semibold">
                        💡 <b>Refer to the file:</b> <code className="font-mono px-1 rounded bg-slate-200/50 dark:bg-slate-800 text-[9px]">TELEGRAM_INTEGRATION_GUIDE.md</code> located in your workspace root directory for complete PHP code templates, database table structures, security recommendations, and cron configurations!
                      </p>
                    </div>

                  </div>

                </div>
              )}

              {/* VIEW 8: FOREWORD MANAGEMENT */}
              {activeTab === "foreword" && (
                <div className="space-y-6">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                    <h2 className="font-serif text-xl md:text-2xl font-black text-black dark:text-white uppercase tracking-tight flex items-center gap-2">
                      <FileText className="w-6 h-6 text-teal-brand" />
                      Manage Foreword
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-1">
                      Write, edit and publish the author's foreword that appears on the public Foreword page.
                    </p>
                  </div>
                  <ManageForeword isDarkMode={isDarkMode} onShowToast={showToast} />
                </div>
              )}

              {/* VIEW 9: PAYMENTS & DONATIONS */}
              {activeTab === "payments" && (
                <PaymentsDashboard isDarkMode={isDarkMode} onShowToast={showToast} />
              )}

              {/* VIEW 10: WEBSITE ANALYTICS */}
              {activeTab === "analytics" && (
                <AnalyticsDashboard isDarkMode={isDarkMode} onShowToast={showToast} />
              )}

            </motion.div>
          </AnimatePresence>

        </main>
      </div>

      {/* ── Processing Overlay — shown while header images are being saved/mapped ── */}
      {isSavingHeaders && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`max-w-sm w-full rounded-2xl border shadow-2xl p-8 text-center space-y-5 ${
            isDarkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-4 border-teal-brand/20" />
              <div className="absolute inset-0 rounded-full border-4 border-t-teal-brand animate-spin" />
              <Image className="absolute inset-0 m-auto w-6 h-6 text-teal-brand" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-serif text-lg font-black uppercase tracking-tight">
                Please Wait — Processing…
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed">
                Mapping and saving header images to the server. This may take a few moments — please do not close this page.
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

