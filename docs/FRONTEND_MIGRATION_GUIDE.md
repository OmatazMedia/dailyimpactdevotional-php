# Frontend Migration Guide: Express → PHP Backend

> **Status: SUPERSEDED.** The API layer has been centralized. This guide is kept for
> historical reference — the instructions below are no longer the way to connect the
> frontend. See the **Current Architecture** section instead.

## Current Architecture (what the code actually does now)

The frontend now talks to the PHP API through a **single, centralized API layer**:

### 1. Single API base — `src/config/api.ts`

```typescript
// src/config/api.ts — THE only place the API base URL is defined
export const API_BASE = import.meta.env.VITE_API_URL || "/backend/api";
```

For same-domain cPanel deployment, `VITE_API_URL` should be left unset (or set to
`/backend/api` in a `.env` file) so the app uses the relative `/backend/api` path.
No component hardcodes the base URL anymore.

### 2. Explicit `.php` endpoints — no extensionless rewrites

Every endpoint is requested with its full filename. The app does **not** depend on
Apache rewriting `/api/admin` → `/api/admin.php`.

| Old (extensionless, root-level) | New (explicit, under `backend/`) |
|---|---|
| `/api/admin` | `/backend/api/admin.php` |
| `/api/settings` | `/backend/api/settings.php` |
| `/api/devotionals` | `/backend/api/devotionals.php` |
| `/api/headers` | `/backend/api/headers.php` |
| `/api/foreword` | `/backend/api/foreword.php` |
| `/api/donations` | `/backend/api/donations.php` |
| `/api/upload` | `/backend/api/upload.php` |
| `/api/ip-bans` | `/backend/api/ip-bans.php` |
| `/api/email-config` | `/backend/api/email-config.php` |
| `/api/login-log` | `/backend/api/login-log.php` |
| `/api/telegram` | `/backend/api/telegram.php` |
| `/api/health` | `/backend/api/health.php` |

### 3. Central API helper — `src/lib/api.ts`

All requests that need consistent error handling should go through the `api()`
helper:

```typescript
import { api } from "../lib/api";
import { API_BASE } from "../config/api";

const data = await api<Devotional[]>("/devotionals.php");
// or with the base:
const data = await fetch(`${API_BASE}/settings.php`).then(r => r.json());
```

The helper:
- throws `ApiError` with the HTTP status and server JSON message
- reports network failures and timeouts clearly (no more generic "API unavailable")
- applies a 20s timeout by default

### 4. Auth uses PHP sessions

Login/logout/session-check all call `api/admin.php?action=login|logout|check`. The
server stores the session; `localStorage["admin_user"]` is only a UI mirror.

---

## Historical guide (pre-centralization)

The following describes the old, manual process — kept only for context.

### 1. Update API_BASE in `src/devotionalsData.ts`

**Change this:**
```typescript
const API_BASE = "http://localhost:3001/api";
```

**To this:**
```typescript
const API_BASE = "/api";
```

### 2. Update hardcoded API URLs in `src/App.tsx`

Find and replace **all** occurrences of `http://localhost:3001/api/` with just `/api/`.

### 3. Update hardcoded API URLs in `src/components/Login.tsx`

Replace `fetch("http://localhost:3001/api/login-log", ...)` with
`fetch("/api/login-log", ...)`.

### 4. Update `src/components/Dashboard.tsx`

Search for ALL occurrences of `http://localhost:3001` or `http://localhost:3001/api`
and replace with `/api`.

### 5. Fix Auth State — Use PHP Sessions (Critical)

Replace the `localStorage.getItem("admin_user")` initializer with a `useEffect` that
calls `fetch("/backend/api/admin.php?action=check")` on mount so the app respects PHP
session expiry and works after page refresh.

### 6. Build & Deployment

```bash
npm run build
# Copy dist/* into the PHP project root (same folder as .htaccess)
```

---

## ⏰ Telegram Scheduler — Set Up a Cron Job

The PHP backend has no persistent runtime, so set up a **cPanel cron job**:

1. **Configure the cron secret key** — Settings → **Cron** in the Dashboard
   (key `cron_secret_key`).
2. **Add a cron job in cPanel:**
   ```
   curl -s "https://yourdomain.com/backend/api/telegram-cron.php?key=YOUR_SECRET_KEY" > /dev/null 2>&1
   ```
   Frequency: every 5-10 minutes (`*/10 * * * *`).
3. **Verify** — check the Telegram broadcast log in the Dashboard.

> Note: `telegram-cron.php` is a real file (no rewrite needed). The
> `backend/api/.htaccess` keeps a compatibility rewrite for
> `/backend/api/telegram/cron` → `telegram-cron.php`, so the friendly cron URL also
> works if you prefer it.

## localStorage That Stays in Place

These localStorage items are UI-only and do NOT need server storage:
- `theme_preference` — Light/dark/auto theme
- `daily_devotionals` — Cached devotional data (synced from API)
- `admin_user` — Admin email (now backed by PHP sessions on the server)
- `admin_timezone` — Timezone setting (synced from API settings)
- Various `mapped_header_*` — Cached header mappings (synced from API)
