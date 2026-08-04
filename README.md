# 📖 Daily Impact Devotional

A full-stack daily devotional platform by **Dr. Andy Osakwe / Andrew Osakwe Ministries International** — publish scripture-based devotionals, broadcast them automatically to a Telegram channel with their banner artwork, collect donations in multiple currencies, and give readers a beautiful installable PWA reading experience.

![Daily Impact Devotional](public/assets/images/dailyimpact.png)

---

## ✨ Features at a Glance

### For Readers
- **Today's Devotional** — automatically picks the devotional for today (Africa/Lagos timezone, rolls over at midnight)
- **Rich reading view** — scripture, devotionals, prayer & confession, one-year Bible reading, drop-cap typography
- **Text-to-Speech** — a floating audio player reads each devotional aloud
- **Share cards** — WhatsApp, Facebook, Twitter/X and Telegram shares include the **devotional's own banner image** in the preview (dynamic Open Graph via `backend/api/og.php`)
- **Reactions** — react to each devotional (🙏 ❤️ 🙌 🔥 👏); votes persist server-side
- **PWA** — installable on **mobile and desktop**, works offline (service worker), splash screen for installed apps
- **Dark mode**, devotionals archive by month/year, author page, foreword page, donations

### For Admins (Publisher Portal)
- **Step-by-step secure login** — email is checked first; the password step appears only for registered emails. Repeated failures ban the IP for real (numeric subnet matching), and banned IPs see a clear "Access Blocked" screen
- **Devotional management** — add, edit, delete, bulk-import from Word (DOCX via mammoth.js)
- **Header images** — upload & map monthly banner images to dates, saved to real files on disk
- **Telegram Automation** — configure bot token + channel, verify the connection live, schedule per-devotional posts, send test broadcasts with a **month/year filter**, and a **Cron Setup guide** for automatic sending
- **Donations** — multi-currency (₦ Naira / $ Dollar / more) with a **currency display switch**, stats, monthly chart, and CSV/PDF exports that respect the switch
- **Website Analytics** — first-party visitor reports: total & unique visits, **average time on site**, visits-per-day chart, visitor **countries/languages/devices/top pages**, and a recent-visits table — all filterable by **month and year**
- **Payments settings** — Paystack / Flutterwave / webhook gateways with color-coded enable switches
- **Email configuration** (Resend/SMTP), **user management**, **IP-ban management**, **login audit log**, **real-time activity feed**, **foreword editor**, site branding & author profile

---

## 🧱 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | **React 19** + **TypeScript** + **Vite 6** |
| Styling | **Tailwind CSS 4** (via `@tailwindcss/vite`) |
| Motion & Icons | **Motion** (Framer Motion), **Lucide React** |
| Routing | **react-router-dom 7** |
| Local dev API | **Express** mock server (`server.ts`) with file-based storage |
| Production API | **PHP 8+** + **MySQL** (cPanel) |
| Automation | **Telegram Bot API** (sendPhoto + sendMessage), cron scheduler |
| Analytics | First-party visit tracker → `backend/api/analytics.php` + MySQL |
| PWA | Web App Manifest + service worker (`public/sw.js`) |
| Imports | **mammoth.js** (DOCX → text), **Quill** (rich editor) |

---

## 🚀 Local Development

**Prerequisites:** Node.js v18+.

```bash
# 1. Install dependencies
cd dailyimpactdevotional
npm install

# 2. Start the frontend (Vite on http://localhost:3000)
npm run dev

# 3. In a second terminal, start the mock API server (Express on :3001)
npm run server
```

The Vite dev server proxies `/backend/api/*` and `/uploads/*` to the mock server (`server.ts`), which persists data to JSON files in `src/data/` (devotionals, settings, mapped headers, telegram log, donations…). Open **http://localhost:3000**.

> **Admin dashboard locally:** the mock server is lightweight and covers the public site + Telegram endpoints. For the full authenticated Publisher Portal (login, users, IP bans), point the app at the PHP backend (e.g. XAMPP/WAMP with the `backend/` folder) or deploy to cPanel — see below.

### Useful scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (port 3000, proxies API to :3001) |
| `npm run server` | Express mock API (port 3001, JSON-file storage) |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |

---

## ☁️ Production — PHP Backend + cPanel Install

The production API is **PHP 8+** with a **MySQL** database. Everything is uploaded straight to your cPanel document root.

### 1. Build the frontend

```bash
npm run build
```

Copy the **contents of `dist/`** (index.html, assets/) into the same folder as `.htaccess`, alongside the `backend/` folder — your document root should look like:

```
public_html/
├── .htaccess          ← SPA routing + API passthrough + social-crawler OG routing
├── index.html         ← from dist/
├── assets/            ← from dist/
├── backend/           ← PHP API (this repo)
│   ├── install.php    ← browser installer (DELETE after install!)
│   ├── database.sql
│   ├── config/
│   │   └── db.php     ← auto-generated by install.php
│   └── api/           ← admin.php, settings.php, telegram.php, og.php, …
└── upload/            ← uploaded header/devotional images (auto-created)
```

### 2. Requirements

- **PHP 8.0+** with `pdo_mysql`, `curl`, `fileinfo`, `mbstring`, `openssl`
- **MySQL** (create a database + user with ALL PRIVILEGES in cPanel → MySQL Databases)
- **mod_rewrite** (cPanel default)

### 3. Run the installer

1. Upload the archive/contents to `public_html`
2. Visit **`https://yourdomain.com/install.php`**
3. Enter MySQL details + your admin email/password
4. **Delete `install.php` afterwards!**

### 4. Verify & log in

- Health check: `https://yourdomain.com/backend/api/health.php`
- Settings: `https://yourdomain.com/backend/api/settings.php`
- Click **Login** on the site → Publisher Portal

### 5. Set up the Telegram cron (automatic sending)

1. cPanel → **Cron Jobs** → *Once Per Minute* (`* * * * *`)
2. Command (replace `USERNAME`):

   ```
   php /home/USERNAME/public_html/backend/api/telegram-cron.php
   ```

   (or with curl: `curl -s "https://yourdomain.com/backend/api/telegram-cron.php" >/dev/null 2>&1`)
3. In the Dashboard → **Telegram Channel Automation** → **Cron Setup** for the full walkthrough. Save your bot token, verify the connection, keep the service **Active**, and schedule devotionals.

> Full walkthroughs live in [`docs/DEPLOY.md`](docs/DEPLOY.md) and [`docs/TELEGRAM_INTEGRATION_GUIDE.md`](docs/TELEGRAM_INTEGRATION_GUIDE.md).

---

## 🔒 Security Notes

- **Secrets encrypted at rest** — Telegram token, SMTP password, payment keys and webhook secrets are AES-256-CBC encrypted (key stored outside the web root in `backend/config/secret.key.php`), and only returned to an authenticated admin session.
- **Login hardening** — email-gate login, session ID regeneration, session fingerprint binding (user-agent + IP subnet), account suspension, and automatic **IP subnet bans** after repeated failures (real numeric range matching — see `isIpInRange()` in `backend/config/db.php`).
- **API auth** — every admin endpoint calls `requireAdmin()`; public settings never leak secrets.
- **Social previews** — shared devotional links render dynamic OG tags to crawlers only (`.htaccess` routes bot user-agents with `?devotional=ID` to `backend/api/og.php`); real browsers get the SPA.

---

## 🧩 Project Structure

```
src/
├── App.tsx                    # Routing, auth gate, data orchestration, meta sync
├── components/
│   ├── Hero.tsx               # Site-wide banner (object-cover, center-center)
│   ├── DevotionalView.tsx     # Devotional reader + share modal + reactions
│   ├── Dashboard.tsx          # Publisher Portal (Telegram, scheduler, users…)
│   ├── Login.tsx              # Email-gate login + banned screen
│   ├── PaymentsDashboard.tsx  # Donations, currency switch, CSV/PDF export
│   ├── DonationSettings.tsx   # Gateway toggles (Paystack/Flutterwave/webhook)
│   ├── InstallPrompt.tsx      # PWA install banner (mobile + desktop guides)
│   └── …                      # Sidebar, Footer, Import, List, Modals…
├── lib/                       # api.ts (fetch helper), pwa.ts, headers.ts
└── config/api.ts              # Single API base URL constant

backend/
├── install.php, database.sql  # Installer + schema
├── config/db.php              # PDO, sessions, secrets, IP-ban helpers
└── api/
    ├── admin.php              # Login/logout/check/users
    ├── analytics.php          # Visit tracking + month/year reports
    ├── settings.php           # Settings CRUD (secrets encrypted)
    ├── telegram.php           # Send/schedule/verify/log
    ├── telegram-cron.php      # Cron scheduler (automatic posting)
    ├── og.php                 # Dynamic Open Graph tags per devotional
    └── …                      # devotionals, headers, donations, upload…

server.ts                      # Local dev mock API (Express, JSON storage)
```

---

<p align="center"><strong>Daily Impact Devotional</strong> — start every day with God's Word. 🙏</p>
