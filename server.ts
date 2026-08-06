/**
 * Daily Impact Devotional — Local File-Based API Server
 * Persists all data to src/data/ JSON files and src/data/uploads/ for images.
 * Acts as a lightweight backend with no external database needed.
 */

import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "node:crypto";

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
const AUDIT_MONTHS_LOWER = ["january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december"];

// ── Mock IP ban store (dev mirror of the PHP ip_bans table) ────────────────
interface IpBanMock {
  id: string; ipAddress: string; cidr: string; reason: string; email: string;
  source: string; failedAttempts: number; active: boolean; whitelisted: boolean; createdAt: string;
}
const IP_BANS_FILE = path.join(DATA_DIR, "ip_bans.json");
function readIpBans(): IpBanMock[] { return readJson<IpBanMock[]>(IP_BANS_FILE, []); }
function writeIpBans(bans: IpBanMock[]): void { writeJson(IP_BANS_FILE, bans); }
function mockSubnet(ip: string): string {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : ip;
}

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

// ─── REACTIONS (single-selection mock mirroring reactions.php) ───────────────
const REACTIONS_FILE = path.join(DATA_DIR, "reactions.json");
// Store shape: devotionalId -> ipHash -> emoji (one reaction per visitor).
type ReactionsStore = Record<string, Record<string, string>>;
function readReactions(): ReactionsStore {
  return readJson<ReactionsStore>(REACTIONS_FILE, {});
}
function writeReactions(store: ReactionsStore): void {
  writeJson(REACTIONS_FILE, store);
}
function reactionCountsFor(store: ReactionsStore, devotionalId: string): Record<string, number> {
  const byIp = store[devotionalId] || {};
  const counts: Record<string, number> = {};
  for (const emoji of Object.values(byIp)) {
    counts[emoji] = (counts[emoji] || 0) + 1;
  }
  return counts;
}
// Stable per-visitor id for the dev mock (no real IPs locally).
function devVisitorId(req: Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined) || "";
  const ip = forwarded.split(",")[0].trim() || req.socket?.remoteAddress || "127.0.0.1";
  return crypto.createHash("sha256").update(ip).digest("hex");
}

// GET counts (+ the single emoji this visitor currently holds)
app.get("/api/reactions", (req: Request, res: Response) => {
  if (req.query.all !== undefined && req.query.all !== "") {
    // All devotionals at once — used by the admin list view.
    const store = readReactions();
    const grouped: Record<string, Record<string, number>> = {};
    for (const [devId] of Object.entries(store)) {
      grouped[devId] = reactionCountsFor(store, devId);
    }
    res.json(grouped);
    return;
  }
  const devotionalId = String(req.query.devotionalId || "");
  if (!devotionalId) {
    res.status(400).json({ error: "devotionalId is required" });
    return;
  }
  const store = readReactions();
  const mine = store[devotionalId]?.[devVisitorId(req)] || null;
  res.json({
    success: true,
    counts: reactionCountsFor(store, devotionalId),
    mine,
  });
});

// POST record a visitor reaction (single-selection: new emoji replaces old)
app.post("/api/reactions", (req: Request, res: Response) => {
  const { devotionalId, emoji, action } = req.body as {
    devotionalId: string;
    emoji: string;
    action: "react" | "unreact";
  };
  if (!devotionalId || !emoji) {
    res.status(400).json({ error: "devotionalId and emoji are required" });
    return;
  }
  const store = readReactions();
  const byIp = store[devotionalId] || (store[devotionalId] = {});
  if (action === "unreact") {
    delete byIp[devVisitorId(req)];
  } else {
    byIp[devVisitorId(req)] = String(emoji).slice(0, 16); // replaces any previous emoji
  }
  writeReactions(store);
  res.json({
    success: true,
    counts: reactionCountsFor(store, devotionalId),
    mine: store[devotionalId]?.[devVisitorId(req)] || null,
  });
});

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
// Mirrors the real backend: online providers (paystack/flutterwave) create a
// PENDING row and return an authorization_url; the mock "gateway" immediately
// redirects back to /?donation=<reference> where ?action=verify marks it paid.
// Bank/manual donations are recorded as success straight away.

app.get("/api/donations", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  if (action === "verify") {
    const reference = String(req.query.reference ?? "");
    const list = readJson<Record<string, unknown>[]>(DONATIONS_FILE, []);
    const idx = list.findIndex((r) => r.reference === reference);
    if (idx === -1) {
      res.status(404).json({ success: false, error: "Donation not found for this reference" });
      return;
    }
    // Mock gateway: the redirect already represents a successful payment.
    list[idx] = { ...list[idx], status: "success" };
    writeJson(DONATIONS_FILE, list);
    const row = list[idx] as Record<string, unknown>;
    res.json({
      success: true,
      status: "success",
      reference,
      provider: row.provider ?? "paystack",
      amount: Number(row.amount ?? 0),
      currency: row.currency ?? "NGN",
      name: row.name ?? "",
      is_anonymous: Number(row.is_anonymous ?? 0),
    });
    return;
  }
  // Admin listing
  res.json(readJson<object[]>(DONATIONS_FILE, []));
});

app.post("/api/donations", (req: Request, res: Response) => {
  const provider = String(req.body.provider ?? "manual");
  const list = readJson<Record<string, unknown>[]>(DONATIONS_FILE, []);

  if (provider === "paystack" || provider === "flutterwave") {
    // Real flow: pending row + hosted checkout URL (mock gateway auto-pays by
    // sending the donor straight back to /?donation=<reference>).
    const reference = `DID-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const record: Record<string, unknown> = {
      id: generateId(),
      reference,
      amount: Number(req.body.amount ?? 0),
      currency: req.body.currency ?? "NGN",
      email: req.body.email ?? "",
      name: req.body.name ?? "",
      phone: req.body.phone ?? "",
      provider,
      status: "pending",
      is_anonymous: req.body.is_anonymous ? 1 : 0,
      date: new Date().toISOString(),
    };
    list.push(record);
    writeJson(DONATIONS_FILE, list);
    const origin = req.headers.origin ?? `http://localhost:${PORT}`;
    res.status(201).json({
      id: record.id,
      reference,
      authorization_url: `${origin}/?donation=${encodeURIComponent(reference)}`,
      status: "pending",
      provider,
      amount: record.amount,
      currency: record.currency,
      is_anonymous: record.is_anonymous,
    });
    return;
  }

  // Bank / manual: recorded as received.
  const record: Record<string, unknown> = {
    ...req.body,
    id: generateId(),
    status: "success",
    date: new Date().toISOString(),
  };
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

  // Parse Paystack-style event — mirrors production fail-closed behavior:
  // only references that EXIST as pending donations are accepted, and the
  // amount must match the stored row.
  if (event?.data) {
    const d = event.data;
    const reference = String(d.reference ?? "");
    const amount = (d.amount ?? 0) / 100; // Paystack sends kobo
    const currency = String(d.currency ?? "NGN");
    const status = d.status === "success" ? "success" : "pending";

    const list = readJson<Record<string, unknown>[]>(DONATIONS_FILE, []);
    const idx = list.findIndex((r) => r.reference === reference);
    if (idx === -1) {
      console.log(`[Webhook] REJECTED: unknown reference ${reference}`);
      res.status(404).json({ success: false, error: "Unknown transaction reference" });
      return;
    }
    const stored = list[idx] as { amount?: number; currency?: string; status?: string };
    if (stored.amount != null && amount > 0 && Math.abs(amount - Number(stored.amount)) > 0.01) {
      console.log(`[Webhook] REJECTED: amount mismatch for ${reference}`);
      res.status(400).json({ success: false, error: "Amount mismatch" });
      return;
    }
    // Never downgrade a confirmed payment.
    if (stored.status === "success" && status !== "success") {
      res.json({ success: true, updated: false, status: stored.status });
      return;
    }

    list[idx] = {
      ...list[idx],
      amount,
      currency,
      status,
      provider: "paystack",
      email: d.customer?.email ?? list[idx].email ?? "",
      name: `${d.customer?.first_name ?? ""} ${d.customer?.last_name ?? ""}`.trim() || list[idx].name,
    };
    writeJson(DONATIONS_FILE, list);
    console.log(`[Webhook] Donation confirmed: ${currency} ${amount} (${reference})`);

    // Send email notification if configured
    const notifyEmail = (settings.notify_email as string) ?? "";
    if (notifyEmail && status === "success") {
      sendEmailNotification(notifyEmail,
        `💰 New Donation Received — ${currency} ${amount.toLocaleString()}`,
        `A donation was received:\n\nAmount: ${currency} ${amount.toLocaleString()}\nFrom: ${String(list[idx].name ?? list[idx].email ?? "")}\nProvider: Paystack\nReference: ${reference}\nDate: ${new Date().toLocaleString()}`
      );
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

interface TwoFaState {
  totpSecret?: string;
  totpEnabled?: boolean;
  emailOtpEnabled?: boolean;
  backupCodes?: string[];
}
interface AdminRecord { email: string; password: string; name: string; bio?: string; twofa?: TwoFaState; }

function readAdmin(): AdminRecord {
  const fallback: AdminRecord = { email: "admin@ministries.org", password: "admin123", name: "Admin", bio: "" };
  const data = readJson<Partial<AdminRecord> | null>(ADMIN_FILE, null);
  if (!data || typeof data.email !== "string" || !data.email) return fallback;
  return {
    email: data.email,
    password: typeof data.password === "string" ? data.password : "admin123",
    name: typeof data.name === "string" ? data.name : "Admin",
    bio: typeof data.bio === "string" ? data.bio : "",
    twofa: data.twofa,
  };
}

function saveAdmin(admin: AdminRecord): void {
  writeJson(ADMIN_FILE, admin);
}

// ─── Mock 2FA helpers (mirror backend/api/2fa.php) ─────────────────────────────
// Pending-login state (mirrors PHP's $_SESSION['pending_2fa']).
const mockPending2fa = new Map<string, { email: string }>();
// TOTP secret generator (base32 alphabet — matches the PHP generateTotpSecret).
function mockGenSecret(): string {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let s = "";
  for (let i = 0; i < 32; i++) s += alpha[Math.floor(Math.random() * alpha.length)];
  return s;
}
// 8-char uppercase hex backup codes (matches PHP generateBackupCodes).
function mockGenBackupCodes(n = 5): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.floor(Math.random() * 0x100000000).toString(16).toUpperCase().padStart(8, "0"));
  }
  return out;
}
function mockTwofaState(admin: AdminRecord): TwoFaState {
  return admin.twofa ?? { totpSecret: "", totpEnabled: false, emailOtpEnabled: false, backupCodes: [] };
}

// ── REAL RFC 6238 TOTP (mirrors the PHP engine) so the authenticator-app flow
//    works exactly as in production — scan the QR, get a real code, verify it.
const B32_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHA.indexOf(ch);
    if (idx === -1) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function mockTotpValid(secret: string, code: string): boolean {
  if (!secret || code.length !== 6) return false;
  const now = Date.now();
  for (let w = -1; w <= 1; w++) {
    // Compute at a fixed offset for the window check.
    const counter = BigInt(Math.floor(now / 1000 / 30) + w);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(counter, 0);
    const hash = crypto.createHmac("sha1", b32Decode(secret)).update(buf).digest();
    const offset = hash[hash.length - 1] & 0x0f;
    const bin = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
    if (String(bin % 10 ** 6).padStart(6, "0") === code) return true;
  }
  return false;
}
// Email OTPs can't be delivered locally — the mock stores them and prints them
// to the dev-server console (look for "[mock-2fa] Email OTP for ...").
const mockEmailOtps = new Map<string, { code: string; expires: number }>();
function sendMockEmailOtp(email: string): void {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  mockEmailOtps.set(email, { code, expires: Date.now() + 10 * 60 * 1000 });
  console.log(`[mock-2fa] Email OTP for ${email}: ${code}`);
}
function mockEmailOtpValid(email: string, code: string): boolean {
  const entry = mockEmailOtps.get(email);
  if (!entry || entry.expires < Date.now()) return false;
  return entry.code === code;
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
      ? { loggedIn: true, user: { email: user.email, name: user.name, bio: readAdmin().bio ?? "" }, banned }
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

    // ── 2FA gate (mirrors admin.php): don't log in yet — require a code. ──
    const twofaState = mockTwofaState(admin);
    const methods: string[] = [];
    if (twofaState.totpEnabled) methods.push("app");
    if (twofaState.emailOtpEnabled) methods.push("email");
    if (methods.length > 0) {
      const pendingToken = generateId() + generateId();
      mockPending2fa.set(pendingToken, { email: admin.email });
      res.json({
        success: true,
        twofaRequired: true,
        pendingToken,
        twofa: { enabled: true, methods, backupRemaining: twofaState.backupCodes?.length ?? 0 },
      });
      return;
    }

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

  if (action === "update-profile") {
    const user = getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const admin = readAdmin();
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim();
    const bio = String(req.body?.bio ?? "").trim();
    if (!name) { res.status(400).json({ success: false, error: "Name is required." }); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ success: false, error: "Enter a valid email address." }); return; }
    admin.name = name;
    admin.email = email;
    admin.bio = bio;
    saveAdmin(admin);
    // Update the live session display name.
    const token = parseCookies(req.headers.cookie)["did_admin"];
    const s = token ? adminSessions.get(token) : undefined;
    if (s) s.name = name;
    res.json({ success: true, user: { name, email, bio } });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use: login, logout" });
});

// ─── 2FA (mock of backend/api/2fa.php) ────────────────────────────────────────
// TOTP/email codes accept any 6-digit input locally (dev convenience); backup
// codes are real and consumed on use. 2FA state persists in admin.json.
app.get("/api/2fa", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  if (action === "status") {
    const user = getSessionUser(req);
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const t = mockTwofaState(readAdmin());
    const methods: string[] = [];
    if (t.totpEnabled) methods.push("app");
    if (t.emailOtpEnabled) methods.push("email");
    res.json({ success: true, twofa: { enabled: methods.length > 0, methods, backupRemaining: t.backupCodes?.length ?? 0 } });
    return;
  }
  res.status(400).json({ error: "Invalid action. Use: status" });
});

app.post("/api/2fa", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  const body = (req.body ?? {}) as Record<string, any>;
  const user = getSessionUser(req);
  const code = String(body.code ?? "").replace(/\D/g, "");

  const buildIssuerUrl = (secret: string) => {
    const admin = readAdmin();
    const issuer = "Daily Impact Devotional";
    const account = admin.name || admin.email;
    return `otpauth://totp/${encodeURIComponent(issuer + ":" + account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  };

  // setup-totp — mint + persist a secret (2FA stays disabled until confirmed).
  if (action === "setup-totp") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const secret = mockGenSecret();
    const admin = readAdmin();
    admin.twofa = { ...mockTwofaState(admin), totpSecret: secret, totpEnabled: false };
    saveAdmin(admin);
    res.json({ success: true, secret, otpauth: buildIssuerUrl(secret) });
    return;
  }

  // confirm-totp — verify the REAL code from the authenticator app, then enable.
  if (action === "confirm-totp") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const admin = readAdmin();
    const t = mockTwofaState(admin);
    if (!mockTotpValid(t.totpSecret ?? "", code)) { res.status(400).json({ error: "Invalid code. Please enter the current code from your authenticator app." }); return; }
    const backupCodes = mockGenBackupCodes(5);
    admin.twofa = { ...t, totpEnabled: true, backupCodes };
    saveAdmin(admin);
    res.json({ success: true, backupCodes });
    return;
  }

  // send-email-otp — store the OTP and print it to the dev console.
  if (action === "send-email-otp") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    sendMockEmailOtp(readAdmin().email);
    res.json({ success: true, message: `A verification code was sent to ${readAdmin().email}.` });
    return;
  }

  // confirm-email — verify the emailed code, enable email 2FA, mint backup codes.
  if (action === "confirm-email") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    if (code.length !== 6 || !mockEmailOtpValid(user.email, code)) { res.status(400).json({ error: "Invalid code. Please check your email for the 6-digit code." }); return; }
    mockEmailOtps.delete(user.email);
    const backupCodes = mockGenBackupCodes(5);
    const admin = readAdmin();
    admin.twofa = { ...mockTwofaState(admin), emailOtpEnabled: true, backupCodes };
    saveAdmin(admin);
    res.json({ success: true, backupCodes });
    return;
  }

  // send-login-otp — email an OTP to the pending 2FA user (printed to console).
  if (action === "send-login-otp") {
    const pending = mockPending2fa.get(String(body.token ?? ""));
    if (!pending) { res.status(400).json({ error: "Invalid or expired verification session." }); return; }
    sendMockEmailOtp(pending.email);
    res.json({ success: true, message: `A verification code was sent to ${pending.email}.` });
    return;
  }

  // verify — finish the pending login with an app/email/backup code.
  if (action === "verify") {
    const pending = mockPending2fa.get(String(body.token ?? ""));
    if (!pending) { res.status(400).json({ error: "Invalid or expired verification session. Please log in again." }); return; }
    const admin = readAdmin();
    const t = mockTwofaState(admin);
    const method = String(body.method ?? "");
    let backupUsed = false;
    let remaining = t.backupCodes?.length ?? 0;

    if (method === "backup") {
      const target = String(body.code ?? "").trim().toUpperCase();
      const codes = (t.backupCodes ?? []).slice();
      const idx = codes.findIndex((c) => c.toUpperCase() === target);
      if (idx === -1) { res.status(400).json({ error: "Invalid backup code." }); return; }
      codes.splice(idx, 1);
      admin.twofa = { ...t, backupCodes: codes };
      saveAdmin(admin);
      remaining = codes.length;
      backupUsed = true;
    } else if (method === "app") {
      if (!mockTotpValid(t.totpSecret ?? "", code)) { res.status(400).json({ error: "Invalid code. Please check your authenticator app and try again." }); return; }
    } else if (method === "email") {
      if (!mockEmailOtpValid(pending.email, code)) { res.status(400).json({ error: "Invalid code. Please check your email for the 6-digit code." }); return; }
      mockEmailOtps.delete(pending.email);
    } else {
      res.status(400).json({ error: "Invalid verification method." }); return;
    }

    mockPending2fa.delete(String(body.token ?? ""));
    const token = generateId() + generateId();
    adminSessions.set(token, { email: admin.email, name: admin.name, lastSeen: Date.now() });
    res.setHeader("Set-Cookie", `did_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}`);
    res.json({
      success: true,
      user: { email: admin.email, name: admin.name, role: "Administrator" },
      backupUsed,
      backupRemaining: remaining,
      backupCodesLow: remaining <= 1,
    });
    return;
  }

  // deactivate — disable a method (needs a live code for that method).
  if (action === "deactivate") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const method = String(body.method ?? "");
    const admin = readAdmin();
    const t = mockTwofaState(admin);
    if (method === "app" && t.totpEnabled && mockTotpValid(t.totpSecret ?? "", code)) {
      admin.twofa = { ...t, totpEnabled: false, totpSecret: "" };
    } else if (method === "email" && t.emailOtpEnabled && mockEmailOtpValid(user.email, code)) {
      mockEmailOtps.delete(user.email);
      admin.twofa = { ...t, emailOtpEnabled: false };
    } else if (method === "backup") {
      const target = String(body.code ?? "").trim().toUpperCase();
      const codes = (t.backupCodes ?? []).slice();
      const idx = codes.findIndex((c) => c.toUpperCase() === target);
      if (idx === -1) { res.status(400).json({ error: "Invalid code." }); return; }
      codes.splice(idx, 1);
      admin.twofa = { ...t, totpEnabled: false, emailOtpEnabled: false, backupCodes: codes };
    } else {
      res.status(400).json({ error: "Invalid code." }); return;
    }
    if (!admin.twofa.totpEnabled && !admin.twofa.emailOtpEnabled) admin.twofa.backupCodes = [];
    saveAdmin(admin);
    const methods: string[] = [];
    if (admin.twofa.totpEnabled) methods.push("app");
    if (admin.twofa.emailOtpEnabled) methods.push("email");
    res.json({ success: true, twofa: { enabled: methods.length > 0, methods, backupRemaining: admin.twofa.backupCodes?.length ?? 0 } });
    return;
  }

  // regenerate-backup — fresh set, replaces the old one.
  if (action === "regenerate-backup") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const backupCodes = mockGenBackupCodes(5);
    const admin = readAdmin();
    admin.twofa = { ...mockTwofaState(admin), backupCodes };
    saveAdmin(admin);
    res.json({ success: true, backupCodes });
    return;
  }

  // admin-reset — wipe 2FA for the (single, local) admin account.
  if (action === "admin-reset") {
    if (!user) { res.status(401).json({ error: "Unauthorized. Please log in first." }); return; }
    const admin = readAdmin();
    admin.twofa = { totpSecret: "", totpEnabled: false, emailOtpEnabled: false, backupCodes: [] };
    saveAdmin(admin);
    res.json({ success: true, message: "2FA has been reset." });
    return;
  }

  res.status(400).json({ error: "Invalid action. Use: setup-totp, confirm-totp, send-email-otp, confirm-email, send-login-otp, verify, deactivate, regenerate-backup, admin-reset" });
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

// GET login log — paginated with month/year filter (+ CSV export)
app.get("/api/login-log", (req: Request, res: Response) => {
  const all = readJson<LoginLogEntry[]>(LOGIN_LOG_FILE, []);
  const month = String(req.query.month ?? "");
  const year = String(req.query.year ?? "");
  let rows = [...all];
  if (year) rows = rows.filter(e => new Date(e.timestamp).getFullYear() === parseInt(year, 10));
  if (month) {
    const mIdx = AUDIT_MONTHS_LOWER.indexOf(month.toLowerCase());
    if (mIdx >= 0) rows = rows.filter(e => new Date(e.timestamp).getMonth() === mIdx);
  }
  rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const perPage = Math.min(200, Math.max(10, parseInt(String(req.query.perPage ?? "25"), 10)));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, parseInt(String(req.query.page ?? "1"), 10)), pages);
  const items = rows.slice((page - 1) * perPage, page * perPage);
  res.json({ items, total, page, pages, perPage });
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

// ─── IP BANS (mock mirror of backend/api/ip-bans.php) ────────────────────────────
app.get("/api/ip-bans", (req: Request, res: Response) => {
  if (req.query.action === "check") {
    const ip = String(req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ?? "127.0.0.1");
    const ban = readIpBans().find(b => b.active && !b.whitelisted && (b.ipAddress === ip || ip.startsWith(b.cidr.split("/")[0])));
    res.json({ banned: !!ban, whitelisted: readIpBans().some(b => b.whitelisted && b.active && (b.ipAddress === ip || ip.startsWith(b.cidr.split("/")[0]))), ban: ban ?? null });
    return;
  }
  const all = readIpBans();
  const scope = String(req.query.scope ?? "active");
  const month = String(req.query.month ?? "");
  const year = String(req.query.year ?? "");
  let rows = all.filter(b => scope === "all" ? true : scope === "whitelisted" ? b.whitelisted : b.active);
  if (year) rows = rows.filter(b => new Date(b.createdAt).getFullYear() === parseInt(year, 10));
  if (month) {
    const mIdx = AUDIT_MONTHS_LOWER.indexOf(month.toLowerCase());
    if (mIdx >= 0) rows = rows.filter(b => new Date(b.createdAt).getMonth() === mIdx);
  }
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const perPage = Math.min(200, Math.max(10, parseInt(String(req.query.perPage ?? "25"), 10)));
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, parseInt(String(req.query.page ?? "1"), 10)), pages);
  res.json({ items: rows.slice((page - 1) * perPage, page * perPage), total, page, pages, perPage });
});

app.post("/api/ip-bans", (req: Request, res: Response) => {
  const action = String(req.query.action ?? "");
  if (action.startsWith("bulk-")) {
    const ids = (req.body as { ids?: string[] }).ids ?? [];
    let bans = readIpBans();
    let affected = 0;
    if (action === "bulk-unban") {
      bans = bans.map(b => ids.includes(b.id) && b.active ? (affected++, { ...b, active: false, unbannedAt: new Date().toISOString(), unbannedBy: "admin" }) : b);
    } else if (action === "bulk-whitelist") {
      bans = bans.map(b => ids.includes(b.id) ? (affected++, { ...b, whitelisted: true, active: true }) : b);
    } else if (action === "bulk-unwhitelist") {
      bans = bans.map(b => ids.includes(b.id) && b.whitelisted ? (affected++, { ...b, whitelisted: false }) : b);
    }
    writeIpBans(bans);
    res.json({ success: true, affected });
    return;
  }
  // Create
  const { ipAddress, reason, email } = req.body as { ipAddress?: string; reason?: string; email?: string };
  if (!ipAddress) { res.status(400).json({ success: false, message: "IP address is required" }); return; }
  const ban: IpBanMock = {
    id: generateId(), ipAddress, cidr: mockSubnet(ipAddress), reason: reason || "Manual ban by admin",
    email: email || "", source: "admin-manual", failedAttempts: 0, active: true, whitelisted: false,
    createdAt: new Date().toISOString(),
  };
  writeIpBans([...readIpBans(), ban]);
  res.status(201).json({ success: true, ban });
});

app.put("/api/ip-bans", (req: Request, res: Response) => {
  const id = String(req.query.id ?? "");
  const { whitelisted } = req.body as { whitelisted?: boolean };
  writeIpBans(readIpBans().map(b => b.id === id ? { ...b, whitelisted: !!whitelisted, active: !!whitelisted || b.active } : b));
  res.json({ success: true });
});

app.delete("/api/ip-bans", (req: Request, res: Response) => {
  const id = String(req.query.id ?? "");
  writeIpBans(readIpBans().map(b => b.id === id ? { ...b, active: false, unbannedAt: new Date().toISOString(), unbannedBy: "admin" } : b));
  res.json({ success: true });
});

// ─── EMAIL CONFIG (mock mirror of backend/api/email-config.php) ─────────────────
const EMAIL_TEMPLATE_KEYS = ["login_notification", "failed_login_alert", "donor_receipt", "password_reset", "new_ip_ban", "ip_unbanned"];

app.get("/api/email-config", (req: Request, res: Response) => {
  if (req.query.action === "templates") {
    res.json({
      templates: EMAIL_TEMPLATE_KEYS.map(key => ({
        key,
        subject: `[${key}] subject`,
        body: `<p>Edit the <b>${key}</b> template body here. Tokens like {{donor_name}} are replaced when the email is sent.</p>`,
      })),
      branding: { siteName: "Daily Impact Devotional", siteLogoUrl: "", socialFacebook: "", socialTwitter: "", socialInstagram: "", socialYoutube: "" },
    });
    return;
  }
  const s = readJson<Record<string, string>>(SETTINGS_FILE, {});
  res.json({
    mailMethod: s.mail_method ?? "resend",
    resend: { apiKey: s.resend_api_key ? s.resend_api_key.slice(0, 8) + "..." : "", fromEmail: s.resend_from_email ?? "", fromName: s.resend_from_name ?? "Daily Impact Devotional", replyTo: s.resend_reply_to ?? "", enabled: (s.resend_enabled ?? "true") === "true" },
    smtp: { host: s.smtp_host ?? "", user: s.smtp_user ?? "", pass: s.smtp_pass ? "********" : "", port: s.smtp_port ?? "587", secure: s.smtp_secure ?? "tls", enabled: (s.smtp_enabled ?? "false") === "true" },
    donation: { fromName: s.donation_from_name ?? "", fromEmail: s.donation_from_email ?? "" },
    notifyEmails: s.security_notify_emails ?? "",
  });
});

app.put("/api/email-config", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const s = readJson<Record<string, string>>(SETTINGS_FILE, {});
  if (req.query.action === "templates") {
    // Templates are stored under email_template_<key>_subject/_body.
    const templates = (body.templates as { key: string; subject?: string; body?: string }[]) ?? [];
    for (const t of templates) {
      if (t.subject) s[`email_template_${t.key}_subject`] = t.subject;
      if (t.body) s[`email_template_${t.key}_body`] = t.body;
    }
    const b = (body.branding as Record<string, string>) ?? {};
    if (b.siteName) s.site_name = b.siteName;
    if (b.siteLogoUrl) s.site_logo_url = b.siteLogoUrl;
    for (const [k, v] of Object.entries({ socialFacebook: "social_facebook", socialTwitter: "social_twitter", socialInstagram: "social_instagram", socialYoutube: "social_youtube" })) {
      if ((b as Record<string, string>)[k] !== undefined) s[v] = (b as Record<string, string>)[k];
    }
    writeJson(SETTINGS_FILE, s);
    res.json({ success: true });
    return;
  }
  const mailMethod = body.mailMethod;
  if (typeof mailMethod === "string" && mailMethod) s.mail_method = mailMethod;
  const resend = body.resend as Record<string, unknown> | undefined;
  if (resend) {
    if (typeof resend.apiKey === "string" && !resend.apiKey.includes("...")) s.resend_api_key = resend.apiKey;
    if (resend.fromEmail) s.resend_from_email = String(resend.fromEmail);
    if (resend.fromName) s.resend_from_name = String(resend.fromName);
    if (resend.replyTo) s.resend_reply_to = String(resend.replyTo);
    if (resend.enabled !== undefined) s.resend_enabled = resend.enabled ? "true" : "false";
  }
  const smtp = body.smtp as Record<string, unknown> | undefined;
  if (smtp) {
    if (smtp.host) s.smtp_host = String(smtp.host);
    if (smtp.user) s.smtp_user = String(smtp.user);
    if (typeof smtp.pass === "string" && smtp.pass !== "********") s.smtp_pass = smtp.pass;
    if (smtp.port) s.smtp_port = String(smtp.port);
    if (smtp.secure) s.smtp_secure = String(smtp.secure);
    if (smtp.enabled !== undefined) s.smtp_enabled = smtp.enabled ? "true" : "false";
  }
  const donation = body.donation as Record<string, unknown> | undefined;
  if (donation) {
    if (donation.fromName) s.donation_from_name = String(donation.fromName);
    if (donation.fromEmail) s.donation_from_email = String(donation.fromEmail);
  }
  if (body.notifyEmails) s.security_notify_emails = String(body.notifyEmails);
  writeJson(SETTINGS_FILE, s);
  res.json({ success: true });
});

app.post("/api/email-config", (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ success: false, error: "Valid email address is required" }); return; }
  console.log(`[Email] Test email queued → ${email} (mock: no real send in dev)`);
  res.json({ success: true, message: "Test email sent via MOCK (dev). Configure Resend/SMTP keys in Settings → Email to send for real.", method: "mock" });
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
// When includeHeader is FALSE the Date + Title block is omitted so the message
// starts at the Scripture section — used when the devotional photo (whose
// caption already carries the date + title) was posted first, so the date and
// title are never duplicated across the two messages.
function buildDevotionalBody(dev: DevotionalRecord, footerText: string, includeHeader = true): string {
  const MAX = 4096;
  const reserve = footerText.length + 40; // footer + separator + slack
  const budget = MAX - reserve;
  const sections: string[] = [];

  // Date + Title (header block — same as homepage). Skipped when the header
  // was already posted with the devotional photo's caption.
  if (includeHeader) {
    const dateStr = `${dev.date.trim()}, ${dev.year}`;
    if (dateStr !== ", 0") sections.push(`<b>${tgEscape(dateStr)}</b>`);
    if (dev.title) sections.push(`<b>${tgEscape(dev.title)}</b>`);
  }

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
  const imageUrl = resolveImageUrl(dev);

  let lastMessageId: number | undefined;
  let lastError: string | undefined;
  let photoPosted = false;

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
      photoPosted = true;
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

  // --- STEP 2: full devotional body (starts at the Scripture section; the
  // date + title header is only re-added if the photo failed to post) ------
  const bodyText = buildDevotionalBody(dev, footerText, photoPosted);
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

// POST re-schedule an already-SENT broadcast at a new time (posts again)
app.post("/api/telegram/reschedule", (req: Request, res: Response) => {
  const { id, postTime } = req.body as { id?: string; postTime?: string };
  if (!id || !/^([01]\d|2[0-3]):[0-5]\d$/.test(postTime || "")) {
    res.status(400).json({ success: false, error: "id and a valid HH:MM postTime are required" });
    return;
  }
  let log = readJson<TelegramLogEntry[]>(TELEGRAM_LOG_FILE, []);
  let found = false;
  log = log.map(e => e.id === id ? (found = true, { ...e, postTime, status: "scheduled", sentAt: undefined, error: undefined }) : e);
  if (!found) { res.status(404).json({ success: false, error: "Broadcast not found" }); return; }
  writeJson(TELEGRAM_LOG_FILE, log);
  res.json({ success: true, message: `Re-scheduled for ${postTime}` });
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
