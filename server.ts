/**
 * Daily Impact Devotional — Local File-Based API Server
 * Persists all data to src/data/ JSON files and src/data/uploads/ for images.
 * Acts as a lightweight backend with no external database needed.
 */

import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// ─── Data paths ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "src", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const DEVOTIONALS_FILE = path.join(DATA_DIR, "devotionals.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const HEADERS_FILE = path.join(DATA_DIR, "mapped_headers.json");
const FOREWORD_FILE = path.join(DATA_DIR, "foreword.json");
const DONATIONS_FILE = path.join(DATA_DIR, "donations.json");
const LOGIN_LOG_FILE = path.join(DATA_DIR, "login_log.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.json");

// Ensure all data directories exist on startup
[DATA_DIR, UPLOADS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve uploaded images as static files
app.use("/uploads", express.static(UPLOADS_DIR));

// CORS headers for Vite dev server on port 3000
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});
app.options("*", (_req, res) => res.sendStatus(200));

// ─── URL normalization ────────────────────────────────────────────────────────
// The production frontend calls explicit PHP-style URLs under /backend/api
// (e.g. /backend/api/devotionals.php?id=X, /backend/api/headers.php?dateKey=X,
// /backend/api/telegram.php?action=send-now). Rewrite those into the
// path-based routes this dev server exposes.
app.use((req, _res, next) => {
  let url = req.url;
  // Strip the production /backend prefix (if present) so the routes below match.
  url = url.replace(/^\/backend\/api/, "/api");
  url = url.replace(/\.php(?=\?|$)/, "");
  url = url.replace(/^\/api\/devotionals\?bulk=1(&|$)/, "/api/devotionals/bulk$1");
  url = url.replace(/^\/api\/devotionals\?id=([^&]+)(&|$)/, "/api/devotionals/$1$2");
  url = url.replace(/^\/api\/headers\?dateKey=([^&]+)(&|$)/, "/api/headers/$1$2");
  url = url.replace(/^\/api\/foreword\?id=([^&]+)(&|$)/, "/api/foreword/$1$2");
  url = url.replace(/^\/api\/telegram\?action=([^&]+)(&|$)/, "/api/telegram/$1$2");
  // action=scheduled&month=July&year=2026 turns into /api/telegram/scheduled&month=...,
  // so restore the "?" before the extra query params.
  url = url.replace(/^(\/api\/telegram\/[^&?]+)&/, "$1?");
  req.url = url;
  next();
});

// ─── Helpers ────────────────────────────────────────────────────────────────────
function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ─── DEVOTIONALS ────────────────────────────────────────────────────────────────

// GET all devotionals
app.get("/api/devotionals", (_req: Request, res: Response) => {
  const data = readJson<object[]>(DEVOTIONALS_FILE, []);
  res.json(data);
});

// POST new devotional
app.post("/api/devotionals", (req: Request, res: Response) => {
  const list = readJson<object[]>(DEVOTIONALS_FILE, []);
  const newDev = { ...req.body, id: generateId() };
  list.push(newDev);
  writeJson(DEVOTIONALS_FILE, list);
  // Auto-schedule the new devotional for Telegram on its own date.
  tgAutoScheduleOnUpload(newDev as DevotionalRecord);
  res.status(201).json(newDev);
});

// POST multiple devotionals (import)
app.post("/api/devotionals/bulk", (req: Request, res: Response) => {
  const incoming: object[] = req.body.devotionals ?? [];
  let list = readJson<{ id?: string; date?: string; year?: number }[]>(DEVOTIONALS_FILE, []);

  const saved = incoming.map((dev: { date?: string; year?: number } & object) => ({
    ...dev,
    id: generateId(),
  }));

  // Remove existing entries that match the same date+year to prevent duplicates
  list = list.filter(
    (existing) =>
      !saved.some(
        (s) => s.date === existing.date && s.year === existing.year
      )
  );

  const newList = [...list, ...saved];
  writeJson(DEVOTIONALS_FILE, newList);
  // Auto-schedule every imported devotional for Telegram on its own date.
  for (const dev of saved) tgAutoScheduleOnUpload(dev as DevotionalRecord);
  res.status(201).json(saved);
});

// PUT update existing devotional
app.put("/api/devotionals/:id", (req: Request, res: Response) => {
  const list = readJson<{ id: string }[]>(DEVOTIONALS_FILE, []);
  const idx = list.findIndex((d) => d.id === req.params.id);
  if (idx === -1) {
    res.status(404).json({ error: "Devotional not found" });
    return;
  }
  list[idx] = { ...req.body, id: req.params.id };
  writeJson(DEVOTIONALS_FILE, list);
  res.json(list[idx]);
});

// DELETE devotional
app.delete("/api/devotionals/:id", (req: Request, res: Response) => {
  let list = readJson<{ id: string }[]>(DEVOTIONALS_FILE, []);
  const before = list.length;
  list = list.filter((d) => d.id !== req.params.id);
  if (list.length === before) {
    res.status(404).json({ error: "Devotional not found" });
    return;
  }
  writeJson(DEVOTIONALS_FILE, list);
  res.json({ success: true });
});

// ─── MAPPED HEADERS (base64 images keyed by date) ───────────────────────────────

// GET all header mappings
app.get("/api/headers", (_req: Request, res: Response) => {
  const data = readJson<object[]>(HEADERS_FILE, []);
  res.json(data);
});

// POST save/update a header mapping (supports base64 data URL or file path)
app.post("/api/headers", (req: Request, res: Response) => {
  const { dateKey, fileName, dataUrl, month, day, year } = req.body as {
    dateKey: string;
    fileName: string;
    dataUrl: string;
    month: string;
    day: string;
    year?: number;
  };

  if (!dateKey || !dataUrl) {
    res.status(400).json({ error: "dateKey and dataUrl are required" });
    return;
  }

  // Save image to disk as a file so it survives without base64 in localStorage
  let savedFilePath = "";
  try {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    const ext = dataUrl.match(/^data:image\/(\w+);base64,/)?.[1] ?? "jpg";
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const diskFileName = `${month}_${day}${year ? "_" + year : ""}_${safeFileName}`;
    savedFilePath = path.join(UPLOADS_DIR, diskFileName);
    fs.writeFileSync(savedFilePath, Buffer.from(base64Data, "base64"));
  } catch (e) {
    console.warn("Could not write image file to disk:", e);
  }

  let headers = readJson<{ dateKey: string; fileName: string; dataUrl: string; filePath?: string }[]>(HEADERS_FILE, []);
  headers = headers.filter((h) => h.dateKey.toLowerCase() !== dateKey.toLowerCase());
  headers.push({
    dateKey,
    fileName,
    dataUrl, // keep base64 for instant use on frontend
    filePath: savedFilePath ? `/uploads/${path.basename(savedFilePath)}` : "",
  });
  writeJson(HEADERS_FILE, headers);
  res.status(201).json({ success: true, filePath: savedFilePath ? `/uploads/${path.basename(savedFilePath)}` : "" });
});

// DELETE a header mapping
app.delete("/api/headers/:dateKey", (req: Request, res: Response) => {
  const key = decodeURIComponent(req.params.dateKey);
  let headers = readJson<{ dateKey: string; filePath?: string }[]>(HEADERS_FILE, []);
  const found = headers.find((h) => h.dateKey.toLowerCase() === key.toLowerCase());

  if (found?.filePath) {
    const absPath = path.join(__dirname, "src", "data", found.filePath);
    try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch { /* ignore */ }
  }

  headers = headers.filter((h) => h.dateKey.toLowerCase() !== key.toLowerCase());
  writeJson(HEADERS_FILE, headers);
  res.json({ success: true });
});

// ─── SETTINGS ───────────────────────────────────────────────────────────────────

// GET settings
app.get("/api/settings", (_req: Request, res: Response) => {
  const data = readJson<object>(SETTINGS_FILE, {
    admin_timezone: "Africa/Lagos",
    telegram_channel_link: "https://t.me/dailyimpactdevotional",
  });
  res.json(data);
});

// PUT update settings (merges)
app.put("/api/settings", (req: Request, res: Response) => {
  const existing = readJson<object>(SETTINGS_FILE, {});
  const updated = { ...existing, ...req.body };
  writeJson(SETTINGS_FILE, updated);
  res.json(updated);
});

// POST ?_method=PUT fallback for hosts/clients that can't send the PUT verb
app.post("/api/settings", (req: Request, res: Response) => {
  if (req.query._method !== "PUT") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }
  const existing = readJson<object>(SETTINGS_FILE, {});
  const updated = { ...existing, ...req.body };
  writeJson(SETTINGS_FILE, updated);
  res.json(updated);
});

// ─── HEALTH ─────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", dataDir: DATA_DIR, uploadsDir: UPLOADS_DIR });
});

// ─── FOREWORD ───────────────────────────────────────────────────────────────────

app.get("/api/foreword", (_req, res) => {
  const data = readJson<object[]>(FOREWORD_FILE, []);
  res.json(data);
});

app.put("/api/foreword", (req: Request, res: Response) => {
  const posts = req.body as object[];
  writeJson(FOREWORD_FILE, posts);
  res.json({ success: true });
});

app.post("/api/foreword", (req: Request, res: Response) => {
  const posts = readJson<object[]>(FOREWORD_FILE, []);
  const newPost = { ...req.body, id: generateId(), publishedAt: new Date().toISOString() };
  posts.push(newPost);
  writeJson(FOREWORD_FILE, posts);
  res.status(201).json(newPost);
});

app.put("/api/foreword/:id", (req: Request, res: Response) => {
  const posts = readJson<{ id: string }[]>(FOREWORD_FILE, []);
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: "Not found" }); return; }
  posts[idx] = { ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  writeJson(FOREWORD_FILE, posts);
  res.json(posts[idx]);
});

app.delete("/api/foreword/:id", (req: Request, res: Response) => {
  let posts = readJson<{ id: string }[]>(FOREWORD_FILE, []);
  posts = posts.filter(p => p.id !== req.params.id);
  writeJson(FOREWORD_FILE, posts);
  res.json({ success: true });
});

// ─── DONATIONS ──────────────────────────────────────────────────────────────────

app.get("/api/donations", (_req, res) => {
  res.json(readJson<object[]>(DONATIONS_FILE, []));
});

app.post("/api/donations", (req: Request, res: Response) => {
  const list = readJson<object[]>(DONATIONS_FILE, []);
  const record = { ...req.body, id: generateId(), date: new Date().toISOString() };
  list.push(record);
  writeJson(DONATIONS_FILE, list);
  res.status(201).json(record);
});

// ─── PAYMENT WEBHOOK (Paystack / Flutterwave incoming events) ───────────────────

app.post("/api/webhook/payment", async (req: Request, res: Response) => {
  const settings = readJson<Record<string, unknown>>(SETTINGS_FILE, {});
  const webhookSecret = (settings.webhook as { secret?: string })?.secret ?? "";

  // Log incoming webhook
  const psSignature = req.headers["x-paystack-signature"] as string | undefined;
  if (psSignature) {
    console.log("[Webhook] Paystack signature present:", psSignature.slice(0, 12) + "...");
  }

  const event = req.body as {
    event?: string;
    data?: {
      reference?: string;
      amount?: number;
      currency?: string;
      customer?: { email?: string; first_name?: string; last_name?: string };
      status?: string;
    };
  };

  // Parse Paystack-style event
  if (event?.data) {
    const d = event.data;
    const record = {
      id: generateId(),
      reference: d.reference ?? "",
      amount: (d.amount ?? 0) / 100, // Paystack sends kobo
      currency: d.currency ?? "NGN",
      email: d.customer?.email ?? "",
      name: `${d.customer?.first_name ?? ""} ${d.customer?.last_name ?? ""}`.trim(),
      provider: "paystack" as const,
      status: d.status === "success" ? "success" : "pending",
      date: new Date().toISOString(),
    };
    const list = readJson<object[]>(DONATIONS_FILE, []);
    // Avoid duplicate references
    const exists = (list as { reference?: string }[]).some(r => r.reference === record.reference);
    if (!exists) {
      list.push(record);
      writeJson(DONATIONS_FILE, list);
      console.log(`[Webhook] Donation recorded: ${record.currency} ${record.amount} from ${record.email}`);

      // Send email notification if configured
      const notifyEmail = (settings.notify_email as string) ?? "";
      if (notifyEmail) {
        sendEmailNotification(notifyEmail,
          `💰 New Donation Received — ${record.currency} ${record.amount.toLocaleString()}`,
          `A donation was received:\n\nAmount: ${record.currency} ${record.amount.toLocaleString()}\nFrom: ${record.name || record.email}\nProvider: Paystack\nReference: ${record.reference}\nDate: ${new Date().toLocaleString()}`
        );
      }
    }
  }

  res.json({ success: true });
});

// ─── ADMIN AUTH (mock of backend/api/admin.php) ─────────────────────────────────
// The real production backend uses PHP sessions; this mock uses a signed
// session token cookie so the Publisher Portal is fully testable locally.
// Credentials live in src/data/admin.json (created on first run).
const ADMIN_SESSION_TTL_MS = 60 * 60 * 1000; // 60 min idle
const adminSessions = new Map<string, { email: string; name: string; lastSeen: number }>();
// Per-IP failed-attempt counter for the local login countdown (mirrors the PHP
// login_logs-based logic). Cleared on successful login.
const MOCK_LOGIN_THRESHOLD = 3;
const loginFailures = new Map<string, number>();
// IPs that have crossed the threshold stay banned (mirrors PHP's permanent
// ip_bans — the mock keeps them in-memory for the dev session).
const mockBannedIps = new Set<string>();

interface AdminRecord { email: string; password: string; name: string; }

function readAdmin(): AdminRecord {
  const fallback: AdminRecord = { email: "admin@ministries.org", password: "admin123", name: "Admin" };
  const data = readJson<Partial<AdminRecord> | null>(ADMIN_FILE, null);
  if (!data || typeof data.email !== "string" || !data.email) return fallback;
  return {
    email: data.email,
    password: typeof data.password === "string" ? data.password : "admin123",
    name: typeof data.name === "string" ? data.name : "Admin",
  };
}

function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function getSessionUser(req: Request): AdminRecord & { email: string; name: string } | null {
  const token = parseCookies(req.headers.cookie)["did_admin"];
  if (!token) return null;
  const s = adminSessions.get(token);
  if (!s) return null;
  if (Date.now() - s.lastSeen > ADMIN_SESSION_TTL_MS) {
    adminSessions.delete(token);
    return null;
  }
  s.lastSeen = Date.now();
  const admin = readAdmin();
  return { email: s.email, name: s.name, password: admin.password };
}

app.get("/api/admin", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  if (action === "check") {
    const user = getSessionUser(req);
    const ip = String(req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "local");
    const banned = mockBannedIps.has(ip);
    res.json(user
      ? { loggedIn: true, user: { email: user.email, name: user.name }, banned }
      : { loggedIn: false, user: null, banned });
    return;
  }
  if (action === "list-users") {
    const user = getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const admin = readAdmin();
    res.json({ success: true, users: [{ id: "1", name: admin.name, email: admin.email, role: "Administrator", status: "Active", createdAt: "" }] });
    return;
  }
  res.status(400).json({ error: "Invalid action. Use: check, or list-users" });
});

app.post("/api/admin", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  const body = (req.body ?? {}) as { email?: string; password?: string; step?: string; id?: string };

  if (action === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const admin = readAdmin();
    const matchesEmail = email !== "" && admin.email.toLowerCase() === email;
    const ip = String(req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "local");
    // Countdown mirror of the PHP backend: N failed attempts → ban.
    const attempts = (loginFailures.get(ip) ?? 0);

    // Record a failed attempt into login_log.json (mirrors admin.php's
    // INSERT INTO login_logs ... success = 0) so the Dashboard's Failed
    // Login Track shows real data while developing locally.
    const recordLoginFailure = () => {
      const ua = String(req.headers["user-agent"] ?? "Unknown");
      const log = readJson<LoginLogEntry[]>(LOGIN_LOG_FILE, []);
      log.push({ id: generateId(), email, timestamp: new Date().toISOString(), ip, userAgent: ua, success: false, location: "Unknown" });
      if (log.length > 500) log.splice(0, log.length - 500);
      writeJson(LOGIN_LOG_FILE, log);
    };

    // Step 1 — email gate: only advance for a registered email.
    if (String(body.step ?? "password") === "email") {
      if (!matchesEmail) {
        recordLoginFailure();
        loginFailures.set(ip, attempts + 1);
        const remaining = Math.max(0, MOCK_LOGIN_THRESHOLD - (attempts + 1));
        if (remaining <= 0) {
          mockBannedIps.add(ip);
          res.status(403).json({ success: false, error: "You have been banned for too many failed login attempts. Please contact the administrator.", banned: true, attemptsRemaining: 0 });
        } else {
          res.status(401).json({ success: false, error: "No account found with this email address. Please check and try again.", attemptsRemaining: remaining });
        }
        return;
      }
      res.json({ success: true, step: "password", emailValid: true, attemptsRemaining: 3 });
      return;
    }

    // Step 2 — password.
    if (!matchesEmail) {
      recordLoginFailure();
      loginFailures.set(ip, attempts + 1);
      const remaining = Math.max(0, MOCK_LOGIN_THRESHOLD - (attempts + 1));
      if (remaining <= 0) {
        mockBannedIps.add(ip);
        res.status(403).json({ success: false, error: "You have been banned for too many failed login attempts. Please contact the administrator.", banned: true, attemptsRemaining: 0 });
      } else {
        res.status(401).json({ success: false, error: "No account found with this email address. Please check and try again.", attemptsRemaining: remaining });
      }
      return;
    }
    if (!body.password || body.password.length < 6) {
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }
    if (body.password !== admin.password) {
      recordLoginFailure();
      loginFailures.set(ip, attempts + 1);
      // Mirror the PHP backend: this failure counts toward the threshold, so
      // 3 attempts → 2 countdown warnings → banned on the 3rd.
      const remaining = Math.max(0, MOCK_LOGIN_THRESHOLD - (attempts + 1));
      if (remaining <= 0) {
        mockBannedIps.add(ip);
        res.status(403).json({ success: false, error: "You have been banned for too many failed login attempts. Please contact the administrator.", banned: true, attemptsRemaining: 0 });
      } else {
        res.status(401).json({ success: false, error: `Invalid email or password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before you are banned.`, attemptsRemaining: remaining });
      }
      return;
    }
    // Success clears the failure counter for this IP.
    loginFailures.delete(ip);

    const token = generateId() + generateId();
    adminSessions.set(token, { email: admin.email, name: admin.name, lastSeen: Date.now() });
    res.setHeader("Set-Cookie", `did_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}`);
    res.json({ success: true, user: { email: admin.email, name: admin.name, role: "Administrator" } });
    return;
  }

  if (action === "logout") {
    const token = parseCookies(req.headers.cookie)["did_admin"];
    if (token) adminSessions.delete(token);
    res.setHeader("Set-Cookie", `did_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    res.json({ success: true });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use: login, logout" });
});

// ─── WEBSITE ANALYTICS (mock of backend/api/analytics.php) ────────────────────────
interface AnalyticsVisit {
  id: string;
  sessionId: string;
  page: string;
  referrer: string;
  locale: string;
  country: string;
  device: string;
  userAgent: string;
  isNew: boolean;
  visitedAt: string; // ISO
  lastActiveAt: string;
  durationSeconds: number;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function readAnalytics(): AnalyticsVisit[] {
  return readJson<AnalyticsVisit[]>(ANALYTICS_FILE, []);
}

function writeAnalytics(rows: AnalyticsVisit[]): void {
  // Keep the file bounded.
  if (rows.length > 5000) rows = rows.slice(rows.length - 5000);
  writeJson(ANALYTICS_FILE, rows);
}

function mockGeo(ip: string): { country: string; city: string } {
  if (ip === "unknown" || ip === "::1" || ip.startsWith("127.") || ip.startsWith("192.168.")) {
    return { country: "Local / Nigeria (dev)", city: "Localhost" };
  }
  return { country: "Unknown", city: "" };
}

app.get("/api/analytics", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");

  if (action === "ranges") {
    const rows = readAnalytics();
    const seen = new Set<string>();
    const ranges: { year: number; month: string }[] = [];
    for (const r of rows) {
      const d = new Date(r.visitedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranges.push({ year: d.getFullYear(), month: MONTH_NAMES[d.getMonth()] });
    }
    res.json({ success: true, ranges });
    return;
  }

  if (action === "summary") {
    const rows = readAnalytics();
    let month = String(req.query.month ?? "").toLowerCase();
    let year = parseInt(String(req.query.year ?? "0"), 10);

    // Default to the most recent month with data.
    if (!MONTH_NAMES.some(m => m.toLowerCase() === month) || !year) {
      const latest = rows.reduce<string | null>((acc, r) => (acc === null || r.visitedAt > acc ? r.visitedAt : acc), null);
      if (latest) {
        const d = new Date(latest);
        month = MONTH_NAMES[d.getMonth()].toLowerCase();
        year = d.getFullYear();
      } else {
        const now = new Date();
        month = MONTH_NAMES[now.getMonth()].toLowerCase();
        year = now.getFullYear();
      }
    }

    const inMonth = rows.filter(r => {
      const d = new Date(r.visitedAt);
      return MONTH_NAMES[d.getMonth()].toLowerCase() === month && d.getFullYear() === year;
    });

    const sessions = new Set(inMonth.map(r => r.sessionId));
    const perDayMap: Record<number, number> = {};
    const locales: Record<string, number> = {};
    const countries: Record<string, number> = {};
    const devices: Record<string, number> = {};
    const pages: Record<string, number> = {};
    let durationSum = 0;
    let durationCount = 0;

    for (const r of inMonth) {
      perDayMap[new Date(r.visitedAt).getDate()] = (perDayMap[new Date(r.visitedAt).getDate()] || 0) + 1;
      if (r.locale) locales[r.locale] = (locales[r.locale] || 0) + 1;
      if (r.country) countries[r.country] = (countries[r.country] || 0) + 1;
      devices[r.device || "desktop"] = (devices[r.device || "desktop"] || 0) + 1;
      if (r.page) pages[r.page] = (pages[r.page] || 0) + 1;
      const dur = r.durationSeconds || Math.max(0, Math.round((new Date(r.lastActiveAt).getTime() - new Date(r.visitedAt).getTime()) / 1000));
      if (dur > 0) { durationSum += dur; durationCount++; }
    }

    const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === month);
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const perDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, visits: perDayMap[i + 1] || 0 }));

    const sortEntries = (map: Record<string, number>) =>
      Object.entries(map).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, visits: v }));

    res.json({
      success: true,
      month: month.charAt(0).toUpperCase() + month.slice(1),
      year,
      totalVisits: inMonth.length,
      uniqueVisitors: sessions.size,
      avgDurationSec: durationCount ? Math.round(durationSum / durationCount) : 0,
      perDay,
      locales: sortEntries(locales).map(e => ({ locale: e.key, visits: e.visits })),
      countries: sortEntries(countries).map(e => ({ country: e.key, visits: e.visits })),
      devices: sortEntries(devices).map(e => ({ device: e.key, visits: e.visits })),
      pages: sortEntries(pages).map(e => ({ page: e.key, visits: e.visits })),
      recent: [...inMonth]
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
        .slice(0, 15)
        .map(r => ({ id: r.id, page: r.page, referrer: r.referrer, locale: r.locale, country: r.country, city: "", device: r.device, duration: r.durationSeconds, visitedAt: r.visitedAt, isNew: r.isNew })),
    });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use: summary, or ranges" });
});

app.post("/api/analytics", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  const body = (req.body ?? {}) as { sessionId?: string; page?: string; referrer?: string; locale?: string; device?: string; durationSeconds?: number };
  const sessionId = String(body.sessionId ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  let rows = readAnalytics();
  const existing = rows.find(r => r.sessionId === sessionId);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";

  if (action === "visit") {
    if (existing) {
      existing.page = String(body.page ?? existing.page).slice(0, 255);
      existing.lastActiveAt = new Date().toISOString();
      writeAnalytics(rows);
      res.json({ success: true, isNew: false });
      return;
    }
    const geo = mockGeo(ip);
    const now = new Date().toISOString();
    rows.push({
      id: generateId(),
      sessionId,
      page: String(body.page ?? "/").slice(0, 255),
      referrer: String(body.referrer ?? "").slice(0, 500),
      locale: String(body.locale ?? "").slice(0, 50),
      country: geo.country,
      device: ["mobile", "tablet", "desktop"].includes(String(body.device ?? "")) ? String(body.device) : "desktop",
      userAgent: "",
      isNew: true,
      visitedAt: now,
      lastActiveAt: now,
      durationSeconds: 0,
    });
    writeAnalytics(rows);
    res.status(201).json({ success: true, isNew: true });
    return;
  }

  if (action === "heartbeat") {
    if (existing) existing.lastActiveAt = new Date().toISOString();
    writeAnalytics(rows);
    res.json({ success: true });
    return;
  }

  if (action === "leave") {
    if (existing) {
      existing.lastActiveAt = new Date().toISOString();
      const reported = Math.max(0, Math.round(Number(body.durationSeconds ?? 0)));
      const elapsed = Math.round((Date.now() - new Date(existing.visitedAt).getTime()) / 1000) + 5;
      existing.durationSeconds = Math.max(existing.durationSeconds, Math.min(reported, elapsed));
    }
    writeAnalytics(rows);
    res.json({ success: true });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use: visit, heartbeat, or leave" });
});

// ─── LOGIN AUDIT LOG & EMAIL NOTIFICATIONS ───────────────────────────────────────

interface LoginLogEntry {
  id: string;
  email: string;
  timestamp: string;
  ip: string;
  userAgent: string;
  success: boolean;
  location?: string;
}

// GET login log
app.get("/api/login-log", (_req, res) => {
  res.json(readJson<LoginLogEntry[]>(LOGIN_LOG_FILE, []).slice(-200));
});

// POST record a login event (called from the frontend on login success)
app.post("/api/login-log", async (req: Request, res: Response) => {
  const { email, success, userAgent } = req.body as { email: string; success: boolean; userAgent: string };
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress || "unknown";

  // Try to resolve rough geo location from IP (public IP only)
  let location = "Unknown location";
  try {
    if (ip !== "unknown" && ip !== "::1" && !ip.startsWith("127.") && !ip.startsWith("192.168.")) {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=city,regionName,country`, {
        signal: AbortSignal.timeout(3000),
      });
      if (geoRes.ok) {
        const geo = await geoRes.json() as { city?: string; regionName?: string; country?: string };
        location = [geo.city, geo.regionName, geo.country].filter(Boolean).join(", ");
      }
    } else {
      location = "Localhost / Local network";
    }
  } catch { /* geo lookup failed silently */ }

  const entry: LoginLogEntry = {
    id: generateId(),
    email,
    timestamp: new Date().toISOString(),
    ip,
    userAgent: userAgent || "Unknown",
    success,
    location,
  };

  const log = readJson<LoginLogEntry[]>(LOGIN_LOG_FILE, []);
  log.push(entry);
  // Keep last 500 entries
  if (log.length > 500) log.splice(0, log.length - 500);
  writeJson(LOGIN_LOG_FILE, log);

  // Email notification on successful login
  const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
  const notifyEmail = settings.notify_email ?? "";
  if (notifyEmail && success) {
    const browser = userAgent?.match(/(Chrome|Firefox|Safari|Edge|Opera)[\/\s]([\d.]+)/)?.[0] ?? userAgent ?? "Unknown browser";
    sendEmailNotification(
      notifyEmail,
      `🔐 New Admin Login — Daily Impact Devotional`,
      `A new login was recorded on your publisher portal.\n\nEmail: ${email}\nTime: ${new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} (WAT)\nIP Address: ${ip}\nLocation: ${location}\nDevice/Browser: ${browser}\n\nIf this was not you, change your password immediately.`
    );
  }

  console.log(`[Login] ${success ? "✅" : "❌"} ${email} from ${ip} (${location})`);
  res.status(201).json({ success: true, entry });
});

// ─── EMAIL NOTIFICATION HELPER ───────────────────────────────────────────────────

function sendEmailNotification(to: string, subject: string, body: string): void {
  // Uses nodemailer if configured, otherwise logs to console + writes to a mail queue file
  const MAIL_QUEUE_FILE = path.join(DATA_DIR, "mail_queue.json");
  const entry = { id: generateId(), to, subject, body, createdAt: new Date().toISOString(), sent: false };

  try {
    const queue = readJson<object[]>(MAIL_QUEUE_FILE, []);
    queue.push(entry);
    // Keep last 100 queued mails
    if (queue.length > 100) queue.splice(0, queue.length - 100);
    writeJson(MAIL_QUEUE_FILE, queue);
    console.log(`[Email] Queued → ${to}: "${subject}"`);
  } catch (e) {
    console.error("[Email] Failed to queue email:", e);
  }

  // Attempt SMTP send if credentials are configured in settings
  const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
  const smtpHost = settings.smtp_host;
  const smtpUser = settings.smtp_user;
  const smtpPass = settings.smtp_pass;
  const smtpPort = parseInt(settings.smtp_port ?? "587", 10);

  if (smtpHost && smtpUser && smtpPass) {
    import("nodemailer")
      .then(nodemailer => {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });
        return transporter.sendMail({
          from: `"Daily Impact Devotional" <${smtpUser}>`,
          to,
          subject,
          text: body,
        });
      })
      .then(info => {
        console.log(`[Email] ✅ Sent to ${to}: ${info.messageId}`);
        // Mark as sent in queue
        try {
          const queue = readJson<{ id: string; sent: boolean }[]>(MAIL_QUEUE_FILE, []);
          const idx = queue.findIndex(q => q.id === entry.id);
          if (idx !== -1) { queue[idx].sent = true; writeJson(MAIL_QUEUE_FILE, queue); }
        } catch { /* ignore */ }
      })
      .catch(err => console.warn("[Email] SMTP send failed:", err.message));
  }
}

// ─── TELEGRAM INTEGRATION ────────────────────────────────────────────────────────

const TELEGRAM_LOG_FILE = path.join(DATA_DIR, "telegram_log.json");

interface TelegramLogEntry {
  id: string;
  devotionalId: string;
  devotionalTitle: string;
  scheduledDate: string; // "July 20"
  scheduledYear: number;
  postTime: string;      // "06:00"
  status: "scheduled" | "sent" | "failed" | "skipped";
  sentAt?: string;
  telegramMessageId?: number;
  error?: string;
}

interface DevotionalRecord {
  id: string;
  date: string;
  year: number;
  title: string;
  scriptureRef: string;
  scriptureText: string;
  paragraphs: string[];
  prayerConfession: string;
  bibleReading: string;
  additionalScripture: string;
  author: string;
  imageUrl?: string;
}

interface HeaderRecord {
  dateKey: string;
  dataUrl?: string;
  filePath?: string;
}

// Get date parts in a given timezone
function getDateInTz(timezone: string): { year: number; month: string; day: number; hour: number; minute: number } {
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return {
      year: parseInt(m.year),
      month: m.month,
      day: parseInt(m.day),
      hour: parseInt(m.hour === "24" ? "0" : m.hour),
      minute: parseInt(m.minute),
    };
  } catch {
    const d = new Date();
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return { year: d.getFullYear(), month: months[d.getMonth()], day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
  }
}

// Escape text for Telegram's HTML parse mode (mirrors tgEscape in telegram.php).
// Editor content can contain raw '&', '<' or '>' — Telegram returns HTTP 400
// "can't parse entities" on those, failing the whole post. Strip tags first
// (labels we add are the only tags kept), then encode so it renders literally.
function tgEscape(text: string): string {
  const plain = text.replace(/<[^>]*>/g, "").trim();
  return plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Build the SHORT caption that goes UNDER the photo — date first, then the
// bold title (same order as the homepage header). Kept tiny so it always fits
// Telegram's 1024-char sendPhoto caption limit.
function buildPhotoCaption(dev: DevotionalRecord): string {
  const MAX = 1024;
  let caption = `<i>📖 ${tgEscape(`${dev.date}, ${dev.year}`)}</i>\n`;
  caption += `<b>${tgEscape(dev.title)}</b>`;
  return caption.slice(0, MAX);
}

// Build the FULL devotional body message, mirroring the homepage layout:
//   <b>Date, Year</b>   (date first, then bold title)
//   <b>Title</b>
//   Scripture: <i>ref</i>
//   "scripture text"
//   [paragraphs...]
//   <b>Additional Scripture Reference:</b>
//   value
//   <b>Prayer & Confession of Faith:</b>
//   value
//   <b>One Year Bible Reading:</b>
//   value
//   —
//   footer
// All section labels are bold, matching the homepage's bold section headings.
// Stays within Telegram's 4096-char sendMessage limit.
function buildDevotionalBody(dev: DevotionalRecord, footerText: string): string {
  const MAX = 4096;
  const reserve = footerText.length + 40; // footer + separator + slack
  const budget = MAX - reserve;
  const sections: string[] = [];

  // Date + Title (header block — same as homepage)
  const dateStr = `${dev.date.trim()}, ${dev.year}`;
  if (dateStr !== ", 0") sections.push(`<b>${tgEscape(dateStr)}</b>`);
  if (dev.title) sections.push(`<b>${tgEscape(dev.title)}</b>`);

  // Scripture
  if (dev.scriptureRef) sections.push(`<b>Scripture:</b> <i>${tgEscape(dev.scriptureRef)}</i>`);
  if (dev.scriptureText) sections.push(`"${tgEscape(dev.scriptureText)}"`);

  // Body paragraphs
  for (const para of dev.paragraphs ?? []) {
    const plain = tgEscape(para);
    if (plain) sections.push(plain);
  }

  // Additional Scripture Reference (bold label)
  if (dev.additionalScripture) sections.push(`<b>Additional Scripture Reference:</b>\n${tgEscape(dev.additionalScripture)}`);

  // Prayer & Confession of Faith (bold label)
  if (dev.prayerConfession) sections.push(`<b>Prayer & Confession of Faith:</b>\n${tgEscape(dev.prayerConfession)}`);

  // One Year Bible Reading (bold label)
  if (dev.bibleReading) sections.push(`<b>One Year Bible Reading:</b>\n${tgEscape(dev.bibleReading)}`);

  // Assemble with \n\n separators, truncating only when out of budget.
  let body = "";
  for (let i = 0; i < sections.length; i++) {
    const glue = i === 0 ? "" : "\n\n";
    const candidate = body + glue + sections[i];
    if (candidate.length <= budget) {
      body = candidate;
    } else {
      const room = budget - body.length - glue.length;
      if (room > 24) body += glue + sections[i].slice(0, room) + "…";
      break;
    }
  }

  if (footerText) body += `\n\n—\n${footerText}`;
  return body.slice(0, MAX);
}

// Resolve the best image URL for a devotional on a given date
function resolveImageUrl(dev: DevotionalRecord): string {
  // 1. Check mapped headers JSON for a disk-saved file path
  const headers = readJson<HeaderRecord[]>(HEADERS_FILE, []);
  const parts = dev.date.trim().match(/^([A-Za-z]+)\s+(\d+)/);
  if (parts) {
    const [, month, day] = parts;
    const match = headers.find(h =>
      h.dateKey.toLowerCase() === `${month} ${day}`.toLowerCase()
    );
    if (match) {
      // Prefer disk file path served via /uploads/
      if (match.filePath) return `http://localhost:3001${match.filePath}`;
      // Fall back to data URL — Telegram can accept URLs but not data URLs
      // so we save the base64 to a temp file and serve it
      if (match.dataUrl && match.dataUrl.startsWith("data:image")) {
        try {
          const base64Data = match.dataUrl.replace(/^data:image\/\w+;base64,/, "");
          const tmpFile = path.join(UPLOADS_DIR, `tmp_${month}_${day}.jpg`);
          fs.writeFileSync(tmpFile, Buffer.from(base64Data, "base64"));
          return `http://localhost:3001/uploads/tmp_${month}_${day}.jpg`;
        } catch { /* ignore */ }
      }
    }
  }
  // 2. Use devotional's own imageUrl if it's a real URL (not base64)
  if (dev.imageUrl && dev.imageUrl.startsWith("http")) return dev.imageUrl;
  // 3. Default banner
  return "https://dailyimpactdevotional.org/images/devotionalTitles/June_2026/Dec-Devotional-Joy-and-Strength.jpg";
}

// Core Telegram send function.
// Two-step posting so the body is never truncated by the 1024-char photo caption limit:
//   1. sendPhoto  -> image + short caption (title + date)
//   2. sendMessage -> full devotional body (scripture, paragraphs, footer) — up to 4096 chars
// If the photo fails, the body is still sent as a standalone text message.
async function sendToTelegram(
  botToken: string,
  channelId: string,
  dev: DevotionalRecord,
  footerText: string
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  const photoCaption = buildPhotoCaption(dev);
  const bodyText = buildDevotionalBody(dev, footerText);
  const imageUrl = resolveImageUrl(dev);

  let lastMessageId: number | undefined;
  let lastError: string | undefined;

  // --- STEP 1: photo + (title, date) -------------------------------------
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channelId,
        photo: imageUrl,
        caption: photoCaption,
        parse_mode: "HTML",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await res.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (json.ok) {
      lastMessageId = json.result?.message_id;
    } else {
      // Photo failed (usually because the image URL isn't publicly reachable).
      // Don't abort — we still want to deliver the devotional text below.
      console.warn(`[Telegram] sendPhoto failed (${json.description}); continuing to body message.`);
      lastError = json.description;
    }
  } catch (e) {
    console.warn(`[Telegram] sendPhoto threw (${String(e)}); continuing to body message.`);
    lastError = String(e);
  }

  // --- STEP 2: full devotional body -------------------------------------
  try {
    const textRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, text: bodyText, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(15000),
    });
    const textJson = await textRes.json() as { ok: boolean; result?: { message_id: number }; description?: string };
    if (textJson.ok) {
      lastMessageId = textJson.result?.message_id;
      return { success: true, messageId: lastMessageId };
    }
    return { success: false, error: textJson.description ?? "Unknown Telegram error" };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// Auto-schedule a freshly-saved devotional for Telegram (mirror of the PHP
// tgAutoScheduleOnUpload). Respects telegram_enabled + telegram_schedule_mode:
// 'manual' skips, other modes schedule the row for the devotional's own date
// so it drops on its own; 'immediate' schedules with the current time so the
// next scheduler tick posts it right away.
function tgAutoScheduleOnUpload(saved: DevotionalRecord): void {
  try {
    const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
    if (settings.telegram_enabled !== "true") return;
    const mode = settings.telegram_schedule_mode ?? "scheduled";
    if (mode === "manual") return;
    let postTime: string | undefined;
    if (mode === "immediate") {
      const tz = settings.admin_timezone ?? "Africa/Lagos";
      const { hour, minute } = getDateInTz(tz);
      postTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
    let log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
    // Re-scheduling replaces any previous not-yet-sent row for this devotional
    log = log.filter(e => !(e.devotionalId === saved.id && e.status !== "sent"));
    log.push({
      id: generateId(),
      devotionalId: saved.id,
      devotionalTitle: saved.title,
      scheduledDate: saved.date,
      scheduledYear: saved.year,
      postTime: postTime ?? settings.telegram_post_time ?? "06:00",
      status: "scheduled",
    });
    writeJson(TELEGRAM_LOG_FILE, log);
  } catch {
    // Scheduling is best-effort — never fail a devotional save over it.
  }
}

// GET telegram schedule log
app.get("/api/telegram/log", (_req, res) => {
  const log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  res.json(log.slice(-100)); // last 100 entries
});

// GET telegram schedule log filtered by month+year (all statuses)
app.get("/api/telegram/scheduled", (req: Request, res: Response) => {
  const month = (req.query.month as string) ?? "";
  const year = parseInt(String(req.query.year ?? "0"), 10);
  if (!month || !year) {
    res.status(400).json({ error: "month and year are required" });
    return;
  }
  const log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  const monthLower = month.toLowerCase();
  const rows = log
    .filter(e => e.scheduledYear === year && e.scheduledDate.toLowerCase().startsWith(monthLower + " "))
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  res.json(rows);
});

// POST schedule one or more devotionals to drop on their own date at postTime
app.post("/api/telegram/schedule", (req: Request, res: Response) => {
  const { devotionalIds, postTime } = req.body as { devotionalIds?: string[]; postTime?: string };
  if (!Array.isArray(devotionalIds) || devotionalIds.length === 0) {
    res.status(400).json({ error: "devotionalIds (array) is required" });
    return;
  }
  const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
  const effectiveTime = postTime || settings.telegram_post_time || "06:00";
  const list = readJson<DevotionalRecord[]>(DEVOTIONALS_FILE, []);

  let log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  let scheduled = 0;
  let failed = 0;
  for (const id of devotionalIds) {
    const dev = list.find(d => d.id === id);
    if (!dev) { failed++; continue; }
    // Re-scheduling replaces any previous not-yet-sent row for this devotional
    log = log.filter(e => !(e.devotionalId === id && e.status !== "sent"));
    log.push({
      id: generateId(),
      devotionalId: dev.id,
      devotionalTitle: dev.title,
      scheduledDate: dev.date,
      scheduledYear: dev.year,
      postTime: effectiveTime,
      status: "scheduled",
    });
    scheduled++;
  }
  writeJson(TELEGRAM_LOG_FILE, log);
  res.json({ success: true, scheduled, failed, postTime: effectiveTime });
});

// POST remove pending (not-yet-sent) scheduled rows for the given devotionals
app.post("/api/telegram/unschedule", (req: Request, res: Response) => {
  const { devotionalIds } = req.body as { devotionalIds?: string[] };
  if (!Array.isArray(devotionalIds) || devotionalIds.length === 0) {
    res.status(400).json({ error: "devotionalIds (array) is required" });
    return;
  }
  let log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  const before = log.length;
  log = log.filter(e => !(devotionalIds.includes(e.devotionalId) && e.status === "scheduled"));
  const removed = before - log.length;
  writeJson(TELEGRAM_LOG_FILE, log);
  res.json({ success: true, removed });
});

// POST send a devotional to Telegram RIGHT NOW (manual trigger from dashboard)
app.post("/api/telegram/send-now", async (req: Request, res: Response) => {
  const { devotionalId } = req.body as { devotionalId?: string };
  const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
  const botToken = settings.telegram_bot_token ?? "";
  const channelId = settings.telegram_channel_id ?? "";
  const footerText = settings.telegram_footer_text ?? "Join our Telegram channel for daily impact! 📖🔥";

  if (!botToken || !channelId) {
    res.status(400).json({ success: false, error: "Bot token and channel ID must be configured in Settings → Telegram." });
    return;
  }

  const list = readJson<DevotionalRecord[]>(DEVOTIONALS_FILE, []);
  let dev: DevotionalRecord | undefined;

  if (devotionalId) {
    dev = list.find(d => d.id === devotionalId);
  } else {
    // Default to today's devotional in Lagos timezone
    const tz = settings.admin_timezone ?? "Africa/Lagos";
    const { year, month, day } = getDateInTz(tz);
    dev = list.find(d => {
      const m = d.date.trim().match(/^([A-Za-z]+)\s+(\d+)/);
      if (!m) return false;
      return m[1].toLowerCase() === month.toLowerCase() &&
             parseInt(m[2]) === day &&
             d.year === year;
    });
  }

  if (!dev) {
    res.status(404).json({ success: false, error: "No devotional found for the specified ID or today's date." });
    return;
  }

  console.log(`[Telegram] Manual send triggered for: "${dev.title}"`);
  const result = await sendToTelegram(botToken, channelId, dev, footerText);

  // Log the result
  const log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  log.push({
    id: generateId(),
    devotionalId: dev.id,
    devotionalTitle: dev.title,
    scheduledDate: dev.date,
    scheduledYear: dev.year,
    postTime: "manual",
    status: result.success ? "sent" : "failed",
    sentAt: new Date().toISOString(),
    telegramMessageId: result.messageId,
    error: result.error,
  });
  writeJson(TELEGRAM_LOG_FILE, log);

  if (result.success) {
    console.log(`[Telegram] ✅ Sent successfully. Message ID: ${result.messageId}`);
    res.json({ success: true, messageId: result.messageId, title: dev.title });
  } else {
    console.error(`[Telegram] ❌ Failed: ${result.error}`);
    res.status(500).json({ success: false, error: result.error });
  }
});

// POST verify bot token and channel connection
app.post("/api/telegram/verify", async (req: Request, res: Response) => {
  const { botToken, channelId } = req.body as { botToken: string; channelId: string };
  if (!botToken || !channelId) {
    res.status(400).json({ success: false, error: "Both bot token and channel ID are required." });
    return;
  }
  try {
    // Check bot info
    const botRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      signal: AbortSignal.timeout(8000),
    });
    const botJson = await botRes.json() as { ok: boolean; result?: { username: string; first_name: string }; description?: string };
    if (!botJson.ok) {
      res.json({ success: false, error: `Invalid bot token: ${botJson.description}` });
      return;
    }
    // Check channel access
    const chatRes = await fetch(`https://api.telegram.org/bot${botToken}/getChat?chat_id=${encodeURIComponent(channelId)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const chatJson = await chatRes.json() as { ok: boolean; result?: { title: string; type: string }; description?: string };
    if (!chatJson.ok) {
      res.json({ success: false, error: `Cannot access channel: ${chatJson.description}. Make sure the bot is added as admin.` });
      return;
    }
    res.json({
      success: true,
      botName: botJson.result?.first_name,
      botUsername: botJson.result?.username,
      channelTitle: chatJson.result?.title,
      channelType: chatJson.result?.type,
    });
  } catch (e) {
    res.json({ success: false, error: `Connection failed: ${String(e)}` });
  }
});

// ─── TELEGRAM SCHEDULER (runs every minute) ──────────────────────────────────────
let lastSchedulerMinute = -1;

async function runTelegramScheduler() {
  const settings = readJson<Record<string, string>>(SETTINGS_FILE, {});
  if (settings.telegram_enabled !== "true") return;

  const botToken = settings.telegram_bot_token ?? "";
  const channelId = settings.telegram_channel_id ?? "";
  const footerText = settings.telegram_footer_text ?? "Join our Telegram channel for daily impact! 📖🔥";
  const tz = settings.admin_timezone ?? "Africa/Lagos";

  if (!botToken || !channelId) return;

  const { year, month, day, hour, minute } = getDateInTz(tz);
  const currentMinuteOfDay = hour * 60 + minute;

  const list = readJson<DevotionalRecord[]>(DEVOTIONALS_FILE, []);
  let log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);

  // Exact-day match: stored dates are zero-padded ("July 02"), so compare the
  // numeric day — never a string prefix, which would grab "July 20" on July 2.
  const matchesToday = (dateStr: string, yearNum: number) => {
    const m = dateStr.trim().match(/^([A-Za-z]+)\s+(\d+)/);
    if (!m) return false;
    return m[1].toLowerCase() === month.toLowerCase() &&
           parseInt(m[2]) === day &&
           yearNum === year;
  };

  // ─── Pass 1: deliver every DUE per-devotional scheduled row ──────────────
  // A row is due when its own date is today AND its post_time has been reached
  // (with a 120-minute grace window so a slightly-delayed tick still catches it).
  const dueRows = log.filter(
    e => e.status === "scheduled" && matchesToday(e.scheduledDate, e.scheduledYear)
  );

  let posted = 0;
  const delivered: string[] = [];

  for (const row of dueRows) {
    const [ph, pm] = (row.postTime || "06:00").split(":");
    const rowMinute = parseInt(ph) * 60 + parseInt(pm ?? "0");
    // Not due yet — a later tick this same day will pick it up
    if (currentMinuteOfDay < rowMinute) continue;
    // Grace window: never post more than 120 min after its slot — mark it
    // skipped so the dashboard doesn't keep counting it as pending.
    if (currentMinuteOfDay - rowMinute > 120) {
      row.status = "skipped";
      row.error = "Missed schedule window (>120 min late)";
      continue;
    }

    const dev = list.find(d => d.id === row.devotionalId);
    if (!dev) {
      row.status = "skipped";
      row.error = "Devotional no longer exists";
      continue;
    }

    console.log(`[Telegram Scheduler] ⏰ Delivering scheduled "${dev.title}" (${row.scheduledDate}, ${row.postTime})...`);
    const result = await sendToTelegram(botToken, channelId, dev, footerText);
    row.status = result.success ? "sent" : "failed";
    row.sentAt = new Date().toISOString();
    row.telegramMessageId = result.messageId;
    row.error = result.error;
    if (result.success) { posted++; delivered.push(dev.title); }
  }

  if (posted > 0) {
    writeJson(TELEGRAM_LOG_FILE, log);
    console.log(`[Telegram Scheduler] ✅ Posted ${posted}: ${delivered.join(", ")}`);
    return;
  }

  // ─── Pass 2: legacy daily fallback ───────────────────────────────────────
  // Only when nothing due was delivered AND the classic 'scheduled' mode is on:
  // post today's devotional once at the configured slot (old behaviour).
  if ((settings.telegram_schedule_mode ?? "scheduled") !== "scheduled") return;

  const postTime = settings.telegram_post_time ?? "06:00";
  const [phStr, pmStr] = postTime.split(":");
  const scheduledMinuteOfDay = parseInt(phStr) * 60 + parseInt(pmStr ?? "0");

  // Only fire once per minute window
  if (currentMinuteOfDay !== scheduledMinuteOfDay) return;
  if (lastSchedulerMinute === currentMinuteOfDay) return;
  lastSchedulerMinute = currentMinuteOfDay;

  const dev = list.find(d => matchesToday(d.date, d.year));
  if (!dev) {
    console.log(`[Telegram Scheduler] No devotional found for ${month} ${day}, ${year} — skipping.`);
    return;
  }

  // Check if already sent today
  const alreadySent = log.some(
    e => e.devotionalId === dev.id && e.status === "sent"
  );
  if (alreadySent) {
    console.log(`[Telegram Scheduler] Already sent "${dev.title}" today — skipping.`);
    return;
  }

  console.log(`[Telegram Scheduler] ⏰ Posting "${dev.title}" to ${channelId}...`);
  const result = await sendToTelegram(botToken, channelId, dev, footerText);

  log.push({
    id: generateId(),
    devotionalId: dev.id,
    devotionalTitle: dev.title,
    scheduledDate: dev.date,
    scheduledYear: dev.year,
    postTime,
    status: result.success ? "sent" : "failed",
    sentAt: new Date().toISOString(),
    telegramMessageId: result.messageId,
    error: result.error,
  });
  writeJson(TELEGRAM_LOG_FILE, log);

  if (result.success) {
    console.log(`[Telegram Scheduler] ✅ Posted! Message ID: ${result.messageId}`);
  } else {
    console.error(`[Telegram Scheduler] ❌ Failed: ${result.error}`);
  }
}

// Tick every 30 seconds
setInterval(runTelegramScheduler, 30_000);
console.log("⏱  Telegram scheduler armed — checks every 30 seconds.");

app.listen(PORT, () => {
  console.log(`\n✅ Daily Impact API server running at http://localhost:${PORT}`);
  console.log(`   Data directory : ${DATA_DIR}`);
  console.log(`   Uploads folder : ${UPLOADS_DIR}\n`);
});
