<p align="center">
  <img src="banner.png" alt="Omataz Media — Imagine. Create. Smile." width="100%" />
</p>

# Daily Impact Devotional

**Daily Impact Devotional** is a full-stack web application for publishing and managing daily scripture-based devotionals. It provides an admin dashboard for content management, automated distribution via Telegram, and a rich reading experience for users.

---

## What's Inside

This application comprises:

- **Devotional Library** — A collection of daily devotionals, each with scripture references, devotional paragraphs, prayer points, and Bible reading plans
- **Admin Dashboard** — A password-protected control panel for managing devotionals, users, header images, and site settings
- **Telegram Bot Integration** — Automatically posts daily devotionals (with images) to a Telegram channel, with a two-step format: photo + caption followed by the full devotional body
- **Email System** — Sends daily devotional emails to subscribers using Nodemailer
- **Text-to-Speech** — An audio player that reads devotionals aloud
- **Foreword Management** — Edit and manage the book's foreword content
- **Donation & Payment Tracking** — Payment dashboard with transaction logging
- **Dark Mode** — Light/dark theme toggle with smooth transitions

---

## How to Use

### For Readers

1. Open the app in your browser
2. Browse devotionals by date using the calendar navigation
3. Toggle dark mode using the theme switcher
4. Use the text-to-speech button to listen to devotionals
5. Click the donate button to support the ministry

### For Admins

1. Click the **Login** button in the top-right corner
2. Enter the admin password (configured in settings)
3. From the dashboard, you can:
   - **Add/Edit/Delete** devotionals
   - **Import** devotionals from Word documents
   - **Upload & map** custom header images to specific dates
   - **Manage** the Telegram bot and view broadcast logs
   - **View** email delivery logs
   - **Track** donations and payments
   - **Edit** the foreword page
   - **Configure** site settings and branding

---

## Run Locally

**Prerequisites:** Node.js (v18+)

```bash
# 1. Clone the repository
git clone https://github.com/OmatazMedia/dailyimpactdevotional.git

# 2. Install dependencies
cd dailyimpactdevotional
npm install

# 3. Set environment variables
cp .env.example .env.local
# Edit .env.local and add your GEMINI_API_KEY

# 4. Start the app
npm run dev
```

The app runs at **http://localhost:3000**.

---

## Tech Stack

| Technology | Purpose |
|---|---|
| **React 19** | Front-end UI |
| **TypeScript** | Type-safe code |
| **Vite** | Dev server & build |
| **Tailwind CSS 4** | Styling |
| **Motion** | Animations |
| **Lucide React** | Icons |
| **Express** | Backend server |
| **Google Gemini AI** | AI features |
| **Nodemailer** | Email delivery |
| **Telegram Bot API** | Channel automation |

---

<p align="center">Built by <strong>Omataz Media</strong></p>
