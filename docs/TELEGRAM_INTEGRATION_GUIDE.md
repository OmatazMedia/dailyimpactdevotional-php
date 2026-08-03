# Telegram Automation & PHP Database Integration Guide

Yes! It is **completely possible** and highly recommended to use a PHP backend with a relational database (such as MySQL or PostgreSQL) for your exported website. 

By separating the **React Frontend Portal** and the **PHP API Backend**, you can easily host the entire system on a standard server (e.g., Apache, Nginx, or shared hosting), while keeping all your devotionals, user accounts, and Telegram configurations securely synchronized.

This guide provides a complete, production-ready blueprint to connect your exported website to a PHP backend and automate your Telegram channel broadcasts with hero images.

---

## 1. System Architecture Overview

When you export your app, you will have a lightweight, modern **Full-Stack Architecture**:

```
 ┌──────────────────────────────────────┐
 │       React Frontend Portal          │
 │ (Builds to static HTML/JS via Vite)  │
 └──────────────────┬───────────────────┘
                    │ REST API Requests (fetch/axios)
                    ▼
 ┌──────────────────────────────────────┐
 │         PHP REST API Layer           │
 │ (Handles endpoints, Auth & cURL)     │
 └──────┬────────────────────────┬──────┘
        │                        │
        ▼ SQL Queries            ▼ HTTP POST
 ┌──────────────┐        ┌──────────────────────┐
 │ MySQL/PG DB  │        │  Telegram API Server │
 │  Database    │        │  (sendPhoto Gateway) │
 └──────────────┘        └──────────────────────┘
```

1. **Frontend**: React handles the beautiful UI console. In production, instead of saving to `localStorage`, the frontend makes standard `fetch` or `axios` HTTP calls to your PHP API endpoints.
2. **Backend**: A folder of simple PHP scripts (e.g., `backend/api/devotionals.php`, `backend/api/telegram.php`) that read/write from your database.
3. **Database**: A MySQL database storing the devotionals and Telegram credentials.
4. **Cron Job Scheduler**: A lightweight task configured on your web host that automatically runs your PHP script daily to post to Telegram.

---

## 2. Database Schema (MySQL)

Run the following SQL queries to initialize your MySQL database. This replaces the frontend `localStorage` tables:

```sql
-- 1. Devotionals Table
CREATE TABLE IF NOT EXISTS `devotionals` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `scriptureReading` VARCHAR(255) NOT NULL,
  `anchorScripture` VARCHAR(255) NOT NULL,
  `date` VARCHAR(100) NOT NULL, -- e.g. "June 7"
  `year` INT NOT NULL, -- e.g. 2026
  `paragraphs` TEXT NOT NULL, -- JSON encoded string of paragraphs array
  `confession` TEXT NOT NULL,
  `thoughtForDay` TEXT NOT NULL,
  `imageUrl` VARCHAR(500) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Integrations Config Table
CREATE TABLE IF NOT EXISTS `integrations` (
  `key_name` VARCHAR(100) NOT NULL PRIMARY KEY,
  `key_value` TEXT NOT NULL,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default Telegram parameters
INSERT INTO `integrations` (`key_name`, `key_value`) VALUES
('telegram_enabled', 'false'),
('telegram_bot_token', ''),
('telegram_channel_id', ''),
('telegram_post_time', '06:00'),
('telegram_footer_text', 'Join our Telegram channel for daily impact words! 📖🔥\nRead more at dailyimpactdevotional.org');
```

---

## 3. How to Set Up Your Telegram Bot

To broadcast your devotionals, you need a Telegram Bot acting as an automated gateway:

1. **Create the Bot**:
   - Open Telegram and search for the official account **`@BotFather`**.
   - Type `/newbot` and follow the instructions.
   - Set a name (e.g., *Daily Impact Devotional*) and a unique username (e.g., *DailyImpactDevotionalBot*).
   - Copy the generated **HTTP API Token** (e.g., `123456789:ABCdef...`). Enter this into your configuration panel.

2. **Connect the Channel**:
   - Create your Telegram Channel or open your existing channel.
   - Go to **Channel Settings** -> **Administrators** -> **Add Administrator**.
   - Search for your Bot's username and add it.
   - Make sure your Bot is given permissions to **Post Messages** and **Post Media**.

---

## 4. PHP Telegram Broadcast Engine (`telegram_broadcast.php`)

This script loads the active devotional for the current calendar day, pulls your Telegram Bot credentials, compiles the message, and sends it with the devotional's hero image via a `multipart/form-data` request using cURL.

Create a file named `backend/api/telegram-cron.php` on your server:

```php
<?php
header("Content-Type: application/json; charset=UTF-8");

// 1. Establish MySQL Database connection
$host = "localhost";
$dbname = "your_database_name";
$username = "your_db_username";
$password = "your_db_password";

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    echo json_encode(["status" => "error", "message" => "Database connection failed: " . $e->getMessage()]);
    exit;
}

// 2. Fetch Telegram Integration settings
$settings = [];
$stmt = $pdo->query("SELECT key_name, key_value FROM integrations");
while ($row = $stmt->fetch()) {
    $settings[$row['key_name']] = $row['key_value'];
}

// Exit early if integration is disabled or credentials are empty
if ($settings['telegram_enabled'] !== 'true') {
    echo json_encode(["status" => "info", "message" => "Telegram automatic broadcast is disabled."]);
    exit;
}

$botToken = $settings['telegram_bot_token'];
$channelId = $settings['telegram_channel_id'];
$footerSignature = $settings['telegram_footer_text'];

if (empty($botToken) || empty($channelId)) {
    echo json_encode(["status" => "error", "message" => "Missing Bot Token or Channel ID configuration."]);
    exit;
}

// 3. Determine today's date format matching your database (e.g., "June 30", 2026)
$currentMonthStr = date("F"); // e.g., "June"
$currentDayStr = date("j");   // e.g., "30" (no leading zeroes)
$currentYearInt = (int)date("Y"); // e.g., 2026
$dateKey = "$currentMonthStr $currentDayStr"; // "June 30"

// 4. Fetch the devotional scheduled for today
$devStmt = $pdo->prepare("SELECT * FROM devotionals WHERE LOWER(`date`) = LOWER(?) AND `year` = ? LIMIT 1");
$devStmt->execute([$dateKey, $currentYearInt]);
$devotional = $devStmt->fetch();

if (!$devotional) {
    echo json_encode(["status" => "info", "message" => "No devotional mapped or uploaded for today ($dateKey, $currentYearInt)."]);
    exit;
}

// 5. Unpack text paragraphs
$paragraphs = json_decode($devotional['paragraphs'], true);
$bodyText = is_array($paragraphs) ? implode("\n\n", $paragraphs) : $devotional['paragraphs'];

// 6. Format Caption using Telegram HTML mode (supports <b>, <i>, <a> tags)
$caption  = "<b>" . mb_strtoupper($devotional['title']) . "</b>\n";
$caption .= "<i>Scripture: " . $devotional['scriptureReading'] . "</i>\n\n";

// Devotionals can be long, but Telegram sendPhoto caption limit is 1024 characters.
// If the content is too long, we truncate it elegantly and add a link to read the full version.
$mainContentLimit = 750;
if (mb_strlen($bodyText) > $mainContentLimit) {
    $caption .= mb_substr($bodyText, 0, $mainContentLimit) . "...\n\n";
} else {
    $caption .= $bodyText . "\n\n";
}

$caption .= "<b>CONFESSION:</b>\n" . $devotional['confession'] . "\n\n";

if (!empty($footerSignature)) {
    $caption .= "---\n" . $footerSignature;
}

// 7. Resolve the image URL (Fallback to default banner if none uploaded)
$imageUrl = $devotional['imageUrl'];
if (empty($imageUrl)) {
    // Replace with your standard default cover path hosted on your site
    $imageUrl = "https://dailyimpactdevotional.org/images/default-banner.jpg"; 
}

// 8. Send Multipart Photo Payload to Telegram API Gateway
$telegramUrl = "https://api.telegram.org/bot" . $botToken . "/sendPhoto";
$postFields = [
    'chat_id'    => $channelId,
    'photo'      => $imageUrl,
    'caption'    => $caption,
    'parse_mode' => 'HTML'
];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $telegramUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($httpCode === 200) {
    echo json_encode([
        "status" => "success", 
        "message" => "Devotional successfully broadcasted!",
        "telegram_response" => json_decode($response, true)
    ]);
} else {
    echo json_encode([
        "status" => "error", 
        "message" => "Telegram API returned HTTP Code $httpCode", 
        "details" => $response,
        "curl_error" => $curlError
    ]);
}
```

---

## 5. Setting Up the Automated Cron Job Scheduler

To make posting automatic (so it runs every day at your scheduled time e.g. **6:00 AM** without you opening the browser):

1. Log into your **Cpanel** or web hosting control panel.
2. Search for the **Cron Jobs** module.
3. Set the cron interval to run **every minute** (or every 5 minutes) using this configuration:
   ```cron
   * * * * *
   ```
4. Enter the command to execute your PHP Telegram broadcast agent. Depending on your server host path, it will look like this:
   ```bash
   /usr/bin/php -q /home/yourusername/public_html/backend/api/telegram-cron.php > /dev/null 2>&1
   ```
5. **How the Scheduler resolves the exact hour:**
   Inside `backend/api/telegram-cron.php`, you can check if the current hour matches the value of `telegram_post_time` stored in the database integrations table before sending, ensuring it fires once exactly on your desired hour!

---

## 6. Binding Your React Frontend to Your PHP Endpoints

Once you export your application code, locate the configuration in `/src/components/Dashboard.tsx` and your fetch handlers (like `onSaveDevotional`). You can modify your React save functions to send POST/GET requests to your php endpoints instead of writing to localStorage:

```typescript
// Example frontend saving hook
const handleSaveToMySQL = async (devotionalData) => {
  try {
    const response = await fetch("https://yourdomain.com/backend/api/devotionals.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(devotionalData)
    });
    const result = await response.json();
    if (result.status === "success") {
      showToast("Devotional successfully saved to database!");
    }
  } catch (error) {
    showToast("Error saving devotional", "error");
  }
};
```

This ensures complete alignment, absolute security of your tokens, and persistent synchronization for Dr. Andy Osakwe Ministries!
