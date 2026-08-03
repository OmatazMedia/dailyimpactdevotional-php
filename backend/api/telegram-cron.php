<?php
/**
 * Daily Impact Devotional - Telegram Scheduler Cron
 * 
 * GET /api/telegram/cron - Run one scheduler tick
 * 
 * Set up a cPanel cron job to call this every 5-10 minutes:
 *   curl -s "https://yourdomain.com/api/telegram/cron?key=YOUR_SECRET_KEY" > /dev/null
 * 
 * The secret key should be set in the settings table as 'cron_secret_key'.
 * If no key is configured, the endpoint can only be called from localhost/CLI.
 *
 * How scheduling works now:
 *  - Uploading a devotional (or bulk import) auto-creates a telegram_log row
 *    with status='scheduled' for THAT devotional's own date (when Telegram is
 *    enabled and mode is not 'manual'). Rows can also be scheduled manually
 *    from the Dashboard (single or month-by-month).
 *  - This cron delivers EVERY due row: scheduled_date = today AND post_time
 *    already reached (plus a 2-hour grace window so a delayed tick still
 *    catches it). Each posted row flips to status='sent'.
 *  - Legacy fallback: if nothing is scheduled today but the old
 *    'telegram_schedule_mode=scheduled' daily slot applies, today's devotional
 *    is posted once at the configured time (existing behaviour preserved).
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/tg-schedule.php';
sendCorsHeaders();

// Load Telegram helper functions (getDateInTz, resolveImageUrl, sendTelegram*,
// buildDevotionalBody).
require_once __DIR__ . '/telegram.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

$settings = getSettings();

// Security: require secret key unless running from CLI
$cronKey = $settings['cron_secret_key'] ?? '';
$providedKey = $_GET['key'] ?? '';

if (php_sapi_name() !== 'cli') {
    if (empty($cronKey)) {
        jsonError('Cron is not configured. Set cron_secret_key in Settings first.', 403);
    }
    if ($providedKey !== $cronKey) {
        jsonError('Invalid secret key', 403);
    }
}

// Check if Telegram is enabled
if (($settings['telegram_enabled'] ?? 'false') !== 'true') {
    jsonResponse(['success' => false, 'message' => 'Telegram posting is disabled']);
}

$botToken  = $settings['telegram_bot_token'] ?? '';
$channelId = $settings['telegram_channel_id'] ?? '';
$postTime  = $settings['telegram_post_time'] ?? '06:00';
$footerText = $settings['telegram_footer_text'] ?? 'Join our Telegram channel for daily impact! 📖🔥';
$tz = $settings['admin_timezone'] ?? 'Africa/Lagos';

if (empty($botToken) || empty($channelId)) {
    jsonResponse(['success' => false, 'message' => 'Bot token or channel ID not configured']);
}

// Get current time in admin timezone
$now = getDateInTz($tz);
$currentMinute = $now['hour'] * 60 + $now['minute'];

// ─── Pass 1: deliver due per-devotional scheduled rows ───────────────────────
// Every telegram_log row whose scheduled_date is TODAY and whose post_time has
// been reached (with a 120-minute grace so a slightly-delayed cron tick still
// catches it) gets posted, then marked 'sent'.
$stmt = $pdo->prepare(
    "SELECT * FROM telegram_log
     WHERE status = 'scheduled'
       AND scheduled_year = ?
       AND LOWER(scheduled_date) LIKE LOWER(?)"
);
// Match the month only — the exact day is compared numerically below. Dates
// are stored zero-padded ("July 02"), so a "July 2%" prefix would both miss
// today's devotional and wrongly grab "July 20".
$stmt->execute([$now['year'], $now['month'] . ' %']);
$dueRows = $stmt->fetchAll();

$posted = 0;
$postedIds = [];
$delivered = [];

foreach ($dueRows as $row) {
    // Exact-date guard (numeric day, not prefix): "July 02" must match only
    // July 2 — never "July 20".
    $dateParts = explode(' ', (string)($row['scheduled_date'] ?? ''));
    if (count($dateParts) !== 2) continue;
    if (strtolower($dateParts[0]) !== strtolower($now['month'])) continue;
    if ((int)$dateParts[1] !== $now['day']) continue;

    // Parse the row's post_time (e.g. "06:00")
    list($ph, $pm) = array_pad(explode(':', (string)($row['post_time'] ?? $postTime)), 2, '0');
    $rowMinute = (int)$ph * 60 + (int)$pm;

    // Not due yet → skip (a later tick this same day will pick it up)
    if ($currentMinute < $rowMinute) continue;
    // Grace window: never post a row more than 120 min after its slot if the
    // cron was down — avoids flooding the channel with hours-old posts. Mark
    // it skipped so the Dashboard doesn't keep counting it as pending.
    if ($currentMinute - $rowMinute > 120) {
        $pdo->prepare("UPDATE telegram_log SET status='skipped', error='Missed schedule window (>120 min late)' WHERE id = ?")
            ->execute([$row['id']]);
        continue;
    }

    // Load the devotional
    $devStmt = $pdo->prepare("SELECT * FROM devotionals WHERE id = ?");
    $devStmt->execute([$row['devotional_id']]);
    $dev = $devStmt->fetch();
    if (!$dev) {
        // Devotional was deleted — mark row skipped so it stops being retried.
        $pdo->prepare("UPDATE telegram_log SET status='skipped', error='Devotional no longer exists' WHERE id = ?")
            ->execute([$row['id']]);
        continue;
    }

    $imageUrl = resolveImageUrl($dev);
    $photoCaption = "<i>📖 " . tgEscape($dev['date'] . ', ' . $dev['year']) . "</i>\n<b>" . tgEscape($dev['title']) . "</b>";
    $bodyText = buildDevotionalBody($dev, $footerText);

    $photoResult = sendTelegramPhoto($botToken, $channelId, $imageUrl, $photoCaption);
    $textResult  = sendTelegramMessage($botToken, $channelId, $bodyText);

    $finalSuccess = $textResult['success'] || $photoResult['success'];
    $messageId = $textResult['messageId'] ?? $photoResult['messageId'] ?? null;
    $error = $textResult['error'] ?? $photoResult['error'] ?? null;

    // Update the existing row (preserves the historical record + id)
    $pdo->prepare(
        "UPDATE telegram_log
         SET status = ?, sent_at = NOW(), telegram_message_id = ?, error = ?
         WHERE id = ?"
    )->execute([$finalSuccess ? 'sent' : 'failed', $messageId, $error, $row['id']]);

    if ($finalSuccess) {
        $posted++;
        $postedIds[] = $dev['id'];
        $delivered[] = $dev['title'];
    }
}

// ─── Pass 2: legacy daily fallback ───────────────────────────────────────────
// Only when nothing due was delivered AND the classic 'scheduled' mode is on:
// post today's devotional once at the configured slot (old behaviour).
if ($posted === 0 && ($settings['telegram_schedule_mode'] ?? 'scheduled') === 'scheduled') {
    // Only fire if the current minute matches the configured post time
    list($ph, $pm) = array_pad(explode(':', $postTime), 2, '0');
    $scheduledMinute = (int)$ph * 60 + (int)$pm;

    if ($currentMinute === $scheduledMinute) {
        // Check if already sent today — compare against the ADMIN timezone's
        // date (CURDATE() would use the MySQL server's timezone instead).
        $todayDate = (new DateTime('now', new DateTimeZone($tz)))->format('Y-m-d');
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM telegram_log
             WHERE status = 'sent'
             AND DATE(sent_at) = ?"
        );
        $stmt->execute([$todayDate]);
        $alreadySentToday = $stmt->fetchColumn() > 0;

        if (!$alreadySentToday) {
            // Find today's devotional (numeric day match — stored dates are
            // zero-padded, e.g. "July 02", so a prefix pattern won't work)
            $stmt = $pdo->prepare(
                "SELECT * FROM devotionals
                 WHERE LOWER(date) LIKE LOWER(?) AND year = ?"
            );
            $stmt->execute([$now['month'] . ' %', $now['year']]);
            $dev = null;
            foreach ($stmt->fetchAll() as $cand) {
                $parts = explode(' ', (string)($cand['date'] ?? ''));
                if (count($parts) === 2
                    && strtolower($parts[0]) === strtolower($now['month'])
                    && (int)$parts[1] === $now['day']) {
                    $dev = $cand;
                    break;
                }
            }

            if ($dev) {
                $imageUrl = resolveImageUrl($dev);
                $photoCaption = "<i>📖 " . tgEscape($dev['date'] . ', ' . $dev['year']) . "</i>\n<b>" . tgEscape($dev['title']) . "</b>";
                $bodyText = buildDevotionalBody($dev, $footerText);

                $photoResult = sendTelegramPhoto($botToken, $channelId, $imageUrl, $photoCaption);
                $textResult  = sendTelegramMessage($botToken, $channelId, $bodyText);

                $finalSuccess = $textResult['success'] || $photoResult['success'];
                $messageId = $textResult['messageId'] ?? $photoResult['messageId'] ?? null;
                $error = $textResult['error'] ?? $photoResult['error'] ?? null;

                $logId = generateId();
                $stmt = $pdo->prepare(
                    "INSERT INTO telegram_log (id, devotional_id, devotional_title, scheduled_date, scheduled_year, post_time, status, sent_at, telegram_message_id, error)
                     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)"
                );
                $stmt->execute([
                    $logId,
                    $dev['id'],
                    $dev['title'],
                    $dev['date'],
                    $dev['year'],
                    $postTime,
                    $finalSuccess ? 'sent' : 'failed',
                    $messageId,
                    $error,
                ]);

                if ($finalSuccess) {
                    $posted++;
                    $delivered[] = $dev['title'];
                }
            }
        }
    }
}

if ($posted > 0) {
    jsonResponse([
        'success'   => true,
        'posted'    => $posted,
        'titles'    => $delivered,
        'message'   => 'Posted ' . $posted . ' devotional(s) to Telegram.',
    ]);
} else {
    jsonResponse([
        'success' => true,
        'posted'  => 0,
        'message' => 'No due scheduled posts at this time. Skipping.',
        'skipped' => true,
    ]);
}
