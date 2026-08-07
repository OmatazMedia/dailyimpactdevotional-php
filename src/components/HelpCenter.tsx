import React, { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  PlusCircle,
  BookOpen,
  UploadCloud,
  Image as ImageIcon,
  Users,
  Send,
  FileText,
  CreditCard,
  BarChart3,
  Settings,
  Search,
  X,
  ArrowRight,
  HelpCircle,
  ChevronRight,
} from "lucide-react";

/**
 * Help Center — a walkthrough for the whole admin dashboard.
 *
 * - Table of contents grouped by dashboard section.
 * - Role-aware: topics are filtered through the same canSee() permission check
 *   the sidebar uses, so a restricted role never sees topics for sections they
 *   can't open (Administrator always sees everything).
 * - Live search across titles, summaries and keywords.
 * - Every topic has a "Go to …" action that jumps straight to the relevant
 *   dashboard tab (and settings sub-tab when applicable).
 */

export interface HelpTarget {
  tab: string;
  subTab?: string;
}

export interface HelpTopic {
  id: string;
  /** ROLE_SECTIONS key — must be granted to the role for this topic to appear. */
  section: string;
  title: string;
  summary: string;
  keywords: string[];
  goTo: HelpTarget;
  body: React.ReactNode;
}

export interface HelpGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  topics: HelpTopic[];
}

const Tip = ({ children, tone = "teal" }: { children: React.ReactNode; tone?: "teal" | "warn" | "rose" }) => (
  <div
    className={`mt-3 px-3 py-2.5 rounded-xl text-[11px] leading-relaxed font-semibold ${
      tone === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
        : tone === "rose"
          ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
          : "bg-teal-brand/10 text-teal-700 dark:text-teal-300"
    }`}
  >
    {children}
  </div>
);

const Steps = ({ items }: { items: string[] }) => (
  <ol className="mt-2 space-y-1.5">
    {items.map((s, i) => (
      <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        <span className="w-4 h-4 rounded-full bg-teal-brand/15 text-teal-brand flex items-center justify-center text-[9px] font-black shrink-0 mt-0.5">
          {i + 1}
        </span>
        <span className="min-w-0">{s}</span>
      </li>
    ))}
  </ol>
);

const GROUPS: HelpGroup[] = [
  {
    key: "overview",
    label: "Overview Console",
    icon: <LayoutDashboard className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "welcome",
        section: "overview",
        title: "Welcome — what you can do here",
        summary: "A role-based map of everything in the publisher portal.",
        keywords: ["welcome", "start", "getting started", "role", "permission", "what can I do"],
        goTo: { tab: "overview" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The dashboard is split into sections listed in the left sidebar. Which sections you see
              is decided by your role: <b>Administrator</b> sees everything, while
              <b> Assistant Editor</b> and <b>Guest Writer</b> are limited by the permission matrix
              (Settings → Roles &amp; Permissions). This help guide hides topics for sections you
              don't have access to, so it always matches what you can actually open.
            </p>
            <Tip>Everything you do here is recorded in the Administrative Log Feed on the Overview tab.</Tip>
          </>
        ),
      },
      {
        id: "activity-feed",
        section: "overview",
        title: "The Administrative Log Feed",
        summary: "Live audit trail of admin actions, with a date filter.",
        keywords: ["log", "activity", "audit", "feed", "filter", "date", "history"],
        goTo: { tab: "overview" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The Overview tab shows a live feed of every admin action — logins, devotional saves,
              header uploads, Telegram and settings changes — refreshed automatically every few
              seconds. Each entry shows the action, which admin did it, and when.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              Use the two <b>date pickers</b> in the feed header (From → To) to see only a specific
              day or range, and press <b>Clear</b> to return to the full feed. Dates are interpreted
              in your admin timezone.
            </p>
            <Tip>This is the first place to check when something changed unexpectedly — the feed is a full audit trail.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "add-devotional",
    label: "Add Devotional",
    icon: <PlusCircle className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "create-devotional",
        section: "add-devotional",
        title: "Create a daily devotional",
        summary: "Everything you need for a new entry: date, title, scripture, paragraphs and prayer.",
        keywords: ["create", "new", "add", "devotional", "write", "title", "scripture", "prayer"],
        goTo: { tab: "add-devotional" },
        body: (
          <>
            <Steps
              items={[
                "Open the Add Devotional tab from the sidebar.",
                "Enter the date (month + day) and year — this is what ties the devotional to a day.",
                "Add the title, the main scripture reference and its text.",
                "Write the body paragraphs, then the Additional Scripture Reference(s), Prayer & Confession, and Daily Bible Reading.",
                "Save — the devotional appears immediately on the homepage for its date and in the scheduler for Telegram.",
              ]}
            />
            <Tip>Telegram posts use the title and date automatically — the title is sent in ALL CAPS on the channel.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "manage-devotionals",
    label: "List Devotionals",
    icon: <BookOpen className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "edit-devotionals",
        section: "manage-devotionals",
        title: "Find, edit and delete devotionals",
        summary: "Search the list, open an entry to edit it, or remove one.",
        keywords: ["edit", "update", "delete", "list", "manage", "remove", "find"],
        goTo: { tab: "manage-devotionals" },
        body: (
          <>
            <Steps
              items={[
                "Open the List Devotionals tab — every entry is shown with its date and title.",
                "Search or scroll to the devotional you need.",
                "Click it to open the editor, change anything, and save (the homepage and Telegram scheduler pick up the change).",
                "To remove entries, select them (or use multi-select) and confirm the delete.",
              ]}
            />
            <Tip>Deleting a devotional also stops its scheduled Telegram post — the scheduler marks it as skipped.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "import-devotional",
    label: "Import Devotional",
    icon: <UploadCloud className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "bulk-import",
        section: "import-devotional",
        title: "Bulk import devotionals",
        summary: "Add many devotionals at once from a DOCX/JSON file.",
        keywords: ["import", "bulk", "upload", "file", "docx", "json", "multiple"],
        goTo: { tab: "import-devotional" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The Import tab lets you upload many devotionals in one go. The importer reads the file,
              maps the fields (date, title, scripture, paragraphs, prayer, bible reading), and creates
              each entry — a summary tells you how many were added and which failed.
            </p>
            <Tip>Imported devotionals are also auto-scheduled for Telegram just like manually created ones.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "header-images",
    label: "Header Images",
    icon: <ImageIcon className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "header-images-guide",
        section: "header-images",
        title: "Upload and manage header images",
        summary: "Give each day a banner image and map it to its devotional date.",
        keywords: ["header", "image", "banner", "upload", "hero", "mapped"],
        goTo: { tab: "header-images" },
        body: (
          <>
            <Steps
              items={[
                "Open the Header Images tab.",
                "Upload your banner images (JPG/PNG) — ideal size is 1920×300 for the homepage hero.",
                "Map each image to the devotional date it should appear on.",
                "Saved mappings are used on the homepage, the devotional view, and social share previews.",
              ]}
            />
            <Tip>When a date has no mapped image, the site falls back to the default hero automatically.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "user-management",
    label: "User Management",
    icon: <Users className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "staff-accounts",
        section: "user-management",
        title: "Manage staff accounts",
        summary: "Add admins, editors and guest writers; reset passwords and ban bad actors.",
        keywords: ["user", "staff", "account", "admin", "editor", "guest", "password", "ban"],
        goTo: { tab: "user-management" },
        body: (
          <>
            <Steps
              items={[
                "Open the User Management tab.",
                "Add a new staff member with an email, name and role — they get an email to set up login.",
                "Reset a staff member's password from the same screen when needed.",
                "Use the ban controls to block suspicious IPs from the admin area entirely.",
              ]}
            />
            <Tip>The role you assign controls which dashboard sections they can open — fine-tune it in Settings → Roles & Permissions.</Tip>
          </>
        ),
      },
      {
        id: "roles-explained",
        section: "user-management",
        title: "The three roles, explained",
        summary: "Administrator, Assistant Editor and Guest Writer — what each one can do.",
        keywords: ["roles", "role", "administrator", "editor", "guest writer", "permissions", "matrix"],
        goTo: { tab: "settings", subTab: "roles" },
        body: (
          <>
            <ul className="mt-1 space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <li><b>Administrator</b> — full access to every section, including settings, security, roles and payments.</li>
              <li><b>Assistant Editor</b> — content work: devotionals, headers, foreword, Telegram and analytics (no user/settings access).</li>
              <li><b>Guest Writer</b> — creates and manages devotionals only.</li>
            </ul>
            <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The exact matrix is editable by an Administrator in Settings → Roles &amp; Permissions,
              and is enforced on the server too — not just hidden in the UI.
            </p>
          </>
        ),
      },
    ],
  },
  {
    key: "telegram-integration",
    label: "Telegram Channel",
    icon: <Send className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "telegram-connect",
        section: "telegram-integration",
        title: "Connect your bot and channel",
        summary: "Wire up the bot token, channel ID and the service toggle.",
        keywords: ["telegram", "bot", "channel", "token", "connect", "enable", "toggle"],
        goTo: { tab: "telegram-integration" },
        body: (
          <>
            <Steps
              items={[
                "Open the Telegram Automation tab.",
                "Create a bot with @BotFather and paste its token into the Bot Token field.",
                "Enter your channel ID (e.g. @yourchannel) and add the bot as an Administrator of the channel.",
                "Turn the Service Active toggle ON and save — a verify button confirms the connection.",
              ]}
            />
            <Tip>You can send a test post from this tab to a devotional of your choice before going live.</Tip>
          </>
        ),
      },
      {
        id: "telegram-scheduler",
        section: "telegram-integration",
        title: "The Broadcast Scheduler",
        summary: "Schedule, reschedule and bulk-manage devotional posts for any month.",
        keywords: ["schedule", "scheduler", "reschedule", "bulk", "unschedule", "month", "broadcast"],
        goTo: { tab: "telegram-integration" },
        body: (
          <>
            <Steps
              items={[
                "In the Telegram Automation tab, open the Broadcast Scheduler for the month you want.",
                "Each devotional row shows its post time and status (Scheduled / Sent / Skipped).",
                "Use the bulk actions to mark all listed rows for scheduling or unscheduling at once.",
                "Save — the cron delivers each row at its scheduled time and flips it to Sent.",
              ]}
            />
            <Tip>A missed window (cron was down) marks the row Skipped instead of flooding the channel later.</Tip>
          </>
        ),
      },
      {
        id: "telegram-cron",
        section: "telegram-integration",
        title: "Cron setup & the freshness chip",
        summary: "Make the scheduler run by itself — every minute — and confirm it with the green chip.",
        keywords: ["cron", "schedule", "frequency", "every minute", "curl", "secret key", "freshness", "run now", "test"],
        goTo: { tab: "telegram-integration" },
        body: (
          <>
            <Steps
              items={[
                "In cPanel → Cron Jobs, add a job that runs every minute (* * * * *).",
                "Use either the curl URL (with your Cron Secret Key) or the php CLI command shown in the Cron Setup box.",
                "Save your secret key in the dashboard — both the Telegram and Email workers use it for the curl method.",
                "Back on the page, the freshness chip turns green 'just now' when the REAL cron fires. The Run now (test) button runs one tick on demand.",
              ]}
            />
            <Tip>Every-minute is safe: each tick only posts rows that are due, so a devotional fires within ~1 minute of its post time — no delays.</Tip>
          </>
        ),
      },
      {
        id: "telegram-format",
        section: "telegram-integration",
        title: "How a Telegram post looks",
        summary: "Two messages per devotional: the image with date + title, then the full text.",
        keywords: ["post", "message", "format", "image", "caption", "body", "scripture"],
        goTo: { tab: "telegram-integration" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              Each devotional is delivered as <b>two messages</b>:
            </p>
            <Steps
              items={[
                "The devotional image, captioned with the date and ALL-CAPS title.",
                "The full text — Scripture → paragraphs → Additional Scripture → Prayer & Confession → Daily Bible Reading.",
              ]}
            />
            <Tip>The date and title appear only once — on the image caption — so nothing is ever duplicated.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "foreword",
    label: "Foreword",
    icon: <FileText className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "foreword-guide",
        section: "foreword",
        title: "Publish the author's foreword",
        summary: "Write and update the foreword shown on the site's foreword page.",
        keywords: ["foreword", "author", "intro", "publish", "welcome", "message"],
        goTo: { tab: "foreword" },
        body: (
          <>
            <Steps
              items={[
                "Open the Foreword tab.",
                "Write or edit the author's welcome message (title, body, author name).",
                "Publish — it replaces the placeholder on the public Foreword page immediately.",
              ]}
            />
            <Tip>You can also manage the author profile (name, title, bio) in Settings → Profile & Branding.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "payments",
    label: "Payments & Donations",
    icon: <CreditCard className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "donations-accept",
        section: "payments",
        title: "Accept donations",
        summary: "Online gateways (Paystack/Flutterwave) and bank transfer — with a thank-you page.",
        keywords: ["donation", "donate", "paystack", "flutterwave", "bank", "transfer", "gateway", "receive"],
        goTo: { tab: "payments" },
        body: (
          <>
            <Steps
              items={[
                "Open the Payments & Donations tab.",
                "Configure your online gateway keys (Paystack and/or Flutterwave) and set the currency.",
                "Add bank transfer details for the manual option shown to donors.",
                "Donations create a pending record, confirm via the gateway webhook, and show a confetti thank-you screen to the donor.",
              ]}
            />
            <Tip>Donation notifications are emailed through the mail worker — keep the Email cron running so receipts go out promptly.</Tip>
          </>
        ),
      },
      {
        id: "payments-dashboard",
        section: "payments",
        title: "Read the payments dashboard",
        summary: "Track every donation by status: success, pending and failed.",
        keywords: ["payments", "dashboard", "status", "success", "pending", "failed", "history", "transactions"],
        goTo: { tab: "payments" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The payments dashboard lists every transaction with its status. Filter by status or
              scroll the history to reconcile donations:
            </p>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              <li><b>Success</b> — confirmed by the gateway.</li>
              <li><b>Pending</b> — started but not yet confirmed (a webhook or retry usually settles it).</li>
              <li><b>Failed</b> — the payment did not complete.</li>
            </ul>
          </>
        ),
      },
    ],
  },
  {
    key: "analytics",
    label: "Website Analytics",
    icon: <BarChart3 className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "analytics-guide",
        section: "analytics",
        title: "Read the website analytics",
        summary: "Visits, page views and engagement for the public site.",
        keywords: ["analytics", "visits", "views", "traffic", "stats", "engagement", "sessions"],
        goTo: { tab: "analytics" },
        body: (
          <>
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              The Analytics tab shows first-party visitor stats — visits, devotional views, and
              engagement — collected from the public site. Use the controls to switch time ranges
              and see which days drive the most readers.
            </p>
            <Tip>Analytics are counted per browser session, so returning visitors are tracked accurately without third-party cookies.</Tip>
          </>
        ),
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: <Settings className="w-3.5 h-3.5" />,
    topics: [
      {
        id: "settings-profile",
        section: "settings",
        title: "Profile & site branding",
        summary: "Your name, the site name/logo, site URL and hero banner.",
        keywords: ["profile", "branding", "logo", "site url", "hero", "banner", "name", "identity"],
        goTo: { tab: "settings", subTab: "profile" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Profile & Branding.",
                "Set your display name/bio and the site's brand details, logo and homepage hero.",
                "The site URL here is used for all emailed links and the logo in email headers — keep it accurate.",
              ]}
            />
            <Tip>The logo is embedded in every branded email header and PDF export automatically.</Tip>
          </>
        ),
      },
      {
        id: "settings-security",
        section: "settings",
        title: "Security: 2FA, login alerts, IP bans",
        summary: "Two-factor authentication, notification toggles and banned IPs.",
        keywords: ["security", "2fa", "two factor", "otp", "authenticator", "ban", "ip ban", "alerts", "login"],
        goTo: { tab: "settings", subTab: "security" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Security.",
                "Enable two-factor authentication with an authenticator app or email OTP (plus backup codes).",
                "Turn on/off login, failed-login and IP-ban notification emails, and set who receives them.",
                "Manage banned IPs — banned addresses can't reach the admin area at all.",
              ]}
            />
            <Tip>The login-notification email includes a 'This wasn't me — Log out all sessions' button that revokes every session instantly.</Tip>
          </>
        ),
      },
      {
        id: "settings-email",
        section: "settings",
        title: "Email transport & delivery status",
        summary: "Resend/SMTP transport sequence and the mail queue audit panel.",
        keywords: ["email", "smtp", "resend", "transport", "primary", "secondary", "mail queue", "delivery", "pending", "send test"],
        goTo: { tab: "settings", subTab: "email" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Email.",
                "Pick the primary and secondary transports (Resend or SMTP) and enter their credentials.",
                "Send a test email to confirm delivery before going live.",
                "Open Mail Delivery Status to watch the queue: Pending means queued-but-not-yet-sent, Delivered shows which transport sent it, Failed shows the last error.",
              ]}
            />
            <Tip>Emails are queued and flushed by the mail cron (send-mail.php) every minute — or instantly via the 'Send pending now' button.</Tip>
          </>
        ),
      },
      {
        id: "settings-templates",
        section: "settings",
        title: "Email templates & test send",
        summary: "Customize every branded email and preview it.",
        keywords: ["template", "email template", "branded", "customize", "test send", "editor"],
        goTo: { tab: "settings", subTab: "templates" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Email Templates.",
                "Pick a template (login, reset, donation, etc.) and edit its content with the visual builder.",
                "Save, then send a test email to preview how it looks in your inbox.",
              ]}
            />
            <Tip>Templates share the brand header automatically — changing the logo updates every email at once.</Tip>
          </>
        ),
      },
      {
        id: "settings-payments",
        section: "settings",
        title: "Donation & bank settings",
        summary: "Gateway keys, currency, and the bank transfer details shown to donors.",
        keywords: ["donation settings", "gateway", "bank", "transfer", "currency", "paystack", "flutterwave"],
        goTo: { tab: "settings", subTab: "payments" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Payments.",
                "Enter your gateway keys and preferred currency.",
                "Add the bank account details for the manual transfer option.",
                "Save — the donate flow on the public site updates immediately.",
              ]}
            />
          </>
        ),
      },
      {
        id: "settings-roles",
        section: "settings",
        title: "Roles & permissions matrix",
        summary: "Decide exactly which sections each staff role can open.",
        keywords: ["roles", "permissions", "matrix", "access", "restrict", "staff", "sections"],
        goTo: { tab: "settings", subTab: "roles" },
        body: (
          <>
            <Steps
              items={[
                "Open Settings → Roles & Permissions.",
                "Tick or untick sections for Assistant Editor and Guest Writer (Administrator always has full access).",
                "Save — the sidebar, the backend APIs, and this Help Center all respect the matrix immediately.",
              ]}
            />
            <Tip>If a staff member says they can't see a section, the most likely cause is the permission matrix here.</Tip>
          </>
        ),
      },
    ],
  },
];

interface HelpCenterProps {
  isDarkMode: boolean;
  canSee: (section: string) => boolean;
  onNavigate: (tab: string, subTab?: string) => void;
  onClose: () => void;
}

export default function HelpCenter({ isDarkMode, canSee, onNavigate, onClose }: HelpCenterProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Groups the current role is allowed to see (topics filtered per group).
  const visibleGroups = useMemo(() => GROUPS.filter((g) => canSee(g.key)), [canSee]);

  const allVisibleTopics = useMemo(() => visibleGroups.flatMap((g) => g.topics), [visibleGroups]);

  // Search: flat list of matching topics across visible groups.
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return allVisibleTopics.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [query, allVisibleTopics]);
  const searchActive = query.trim().length > 0;

  // Auto-select the first topic on mount / when visibility or the active
  // search results change (so the content pane never shows a stale topic).
  useEffect(() => {
    const pool = searchActive ? searchResults : allVisibleTopics;
    if (!selectedId || !pool.some((t) => t.id === selectedId)) {
      setSelectedId(pool[0]?.id ?? null);
    }
  }, [allVisibleTopics, searchResults, searchActive, selectedId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const selected = allVisibleTopics.find((t) => t.id === selectedId) ?? null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Help Center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`relative w-full max-w-5xl h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${
          isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: title + search + close */}
        <div className={`px-5 py-4 border-b flex items-center gap-3 ${isDarkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/60"}`}>
          <div className="w-9 h-9 rounded-full bg-teal-brand/15 text-teal-brand flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-sm font-black tracking-tight text-slate-900 dark:text-white">
              Help Center
            </h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
              {searchActive
                ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`
                : `${allVisibleTopics.length} guides · filtered to your role`}
            </p>
          </div>
          <div className="relative flex-1 max-w-xs hidden sm:block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search guides…"
              className={`w-full py-2 pl-8 pr-3 rounded-xl text-xs border focus:outline-none ${
                isDarkMode
                  ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                  : "bg-white border-slate-200 text-slate-900 placeholder-slate-400"
              }`}
            />
          </div>
          <button
            onClick={onClose}
            aria-label="Close help"
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              isDarkMode
                ? "text-slate-400 hover:text-white hover:bg-slate-800"
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile search + topic picker (the ToC sidebar is desktop-only) */}
        <div className={`px-5 py-2.5 border-b sm:hidden space-y-2 ${isDarkMode ? "border-slate-800" : "border-slate-100"}`}>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search guides…"
              className={`w-full py-2 pl-8 pr-3 rounded-xl text-xs border focus:outline-none ${
                isDarkMode
                  ? "bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                  : "bg-white border-slate-200 text-slate-900 placeholder-slate-400"
              }`}
            />
          </div>
          <select
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            aria-label="Choose a guide"
            className={`w-full py-2 px-3 rounded-xl text-xs font-bold border focus:outline-none ${
              isDarkMode
                ? "bg-slate-950 border-slate-800 text-white"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <option value="" disabled>Choose a guide…</option>
            {(searchActive ? searchResults : allVisibleTopics).map((t) => (
              <option key={t.id} value={t.id}>
                {visibleGroups.find((g) => g.key === t.section)?.label ?? ""} — {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* Body: ToC + topic */}
        <div className="flex flex-1 min-h-0">
          {/* Table of contents */}
          <aside className={`w-60 shrink-0 hidden md:flex flex-col border-r overflow-y-auto ${
            isDarkMode ? "border-slate-800 bg-slate-950/30" : "border-slate-100 bg-slate-50/40"
          }`}>
            {searchActive ? (
              <div className="p-3 space-y-0.5">
                <p className="px-2 pt-2 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">Results</p>
                {searchResults.length === 0 && (
                  <p className="px-2 py-3 text-[11px] text-slate-400 italic font-semibold">No guides match your search.</p>
                )}
                {searchResults.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors ${
                      selectedId === t.id
                        ? "bg-teal-brand/15 text-teal-brand"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {visibleGroups.map((g) => (
                  <div key={g.key}>
                    <p className="px-2 pt-1 pb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      <span className="text-teal-brand">{g.icon}</span>
                      {g.label}
                    </p>
                    <div className="space-y-0.5">
                      {g.topics.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedId(t.id)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-bold leading-snug transition-colors flex items-start gap-1.5 ${
                            selectedId === t.id
                              ? "bg-teal-brand/15 text-teal-brand"
                              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          }`}
                        >
                          <ChevronRight className={`w-3 h-3 mt-0.5 shrink-0 ${selectedId === t.id ? "opacity-100" : "opacity-0"}`} />
                          {t.title}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* Topic content */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {selected ? (
              <div className="p-5 md:p-7 max-w-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-teal-brand mb-1">
                  {visibleGroups.find((g) => g.key === selected.section)?.label ?? selected.section}
                </p>
                <h3 className="font-serif text-lg font-black tracking-tight text-slate-900 dark:text-white">
                  {selected.title}
                </h3>
                <p className="mt-1 text-[11px] text-slate-400 font-semibold leading-relaxed">{selected.summary}</p>
                <div className="mt-4">{selected.body}</div>
                <button
                  onClick={() => onNavigate(selected.goTo.tab, selected.goTo.subTab)}
                  className="mt-6 inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-teal-brand text-white text-[11px] font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-all"
                >
                  Go to {selected.goTo.subTab ? `Settings → ${selected.goTo.subTab}` : (visibleGroups.find((g) => g.key === selected.section)?.label ?? "page")}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="p-10 text-center">
                <p className="text-xs text-slate-400 italic font-semibold">
                  {searchActive ? "No guides match your search." : "Nothing to show — your role has no guides in this section yet."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
