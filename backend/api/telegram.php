<?php
/**
 * Daily Impact Devotional - Telegram Integration API
 * 
 * GET  /api/telegram/log            - Get telegram broadcast log
 * GET  /api/telegram/scheduled      - Get scheduled/sent log for a month+year
 * POST /api/telegram/send-now       - Send a devotional to Telegram NOW
 * POST /api/telegram/schedule       - Schedule devotional(s) to post on their date
 * POST /api/telegram/unschedule     - Remove pending scheduled posts
 * POST /api/telegram/verify         - Verify bot token and channel
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/tg-schedule.php';
sendCorsHeaders();

// Only run the request handler when this file is the ACTUAL entry point.
// telegram-cron.php includes telegram.php just for its helper functions —
// without this guard the switch below would run against the cron request and
// jsonError() would exit, silently killing the scheduled delivery.
$isEntryPoint = (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'telegram.php');
if ($isEntryPoint) {

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Parse action from URL path (order matters: '/unschedule' and '/scheduled'
// both contain '/schedule', so the longer paths must be tested first).
$uri = $_SERVER['REQUEST_URI'] ?? '';
if (strpos($uri, '/send-now') !== false) {
    $action = 'send-now';
} elseif (strpos($uri, '/unschedule') !== false) {
    $action = 'unschedule';
} elseif (strpos($uri, '/scheduled') !== false) {
    $action = 'scheduled';
} elseif (strpos($uri, '/schedule') !== false) {
    $action = 'schedule';
} elseif (strpos($uri, '/verify') !== false) {
    $action = 'verify';
} elseif (strpos($uri, '/log') !== false || strpos($uri, '?action=log') !== false) {
    $action = 'log';
}

switch ($method) {
    case 'GET':
        if ($action === 'log') {
            // GET /api/telegram/log
            $stmt = $pdo->query("SELECT * FROM telegram_log ORDER BY created_at DESC LIMIT 100");
            $logs = $stmt->fetchAll();

            $result = [];
            foreach ($logs as $log) {
                $result[] = [
                    'id'              => (string)$log['id'],
                    'devotionalId'    => $log['devotional_id'],
                    'devotionalTitle' => $log['devotional_title'],
                    'scheduledDate'   => $log['scheduled_date'],
                    'scheduledYear'   => (int)$log['scheduled_year'],
                    'postTime'        => $log['post_time'],
                    'status'          => $log['status'],
                    'sentAt'          => $log['sent_at'],
                    'telegramMessageId'=> $log['telegram_message_id'],
                    'error'           => $log['error'],
                ];
            }

            jsonResponse($result);
        } elseif ($action === 'scheduled') {
            // GET /api/telegram/scheduled?month=July&year=2026
            // Rows for a whole month — lets the admin see, per devotional,
            // whether it is scheduled, already sent, or failed.
            $month = $_GET['month'] ?? '';
            $year  = (int)($_GET['year'] ?? 0);
            if ($month === '' || $year <= 0) {
                jsonError('month and year are required', 400);
            }
            jsonResponse(tgScheduledForMonth(ucfirst(strtolower($month)), $year));
        } else {
            jsonError('Invalid action. Use: log, scheduled, send-now, schedule, unschedule, or verify');
        }
        break;

    case 'POST':
        if ($action === 'send-now') {
            requireAdmin();
            // POST /api/telegram/send-now
            $input = jsonInput();
            $devotionalId = $input['devotionalId'] ?? null;

            $settings = getSettings();
            $botToken  = $settings['telegram_bot_token'] ?? '';
            $channelId = $settings['telegram_channel_id'] ?? '';
            $footerText = $settings['telegram_footer_text'] ?? 'Join our Telegram channel for daily impact! 📖🔥';

            if (empty($botToken) || empty($channelId)) {
                jsonError('Bot token and channel ID must be configured in Settings', 400);
            }

            // Find the devotional
            if ($devotionalId) {
                $stmt = $pdo->prepare("SELECT * FROM devotionals WHERE id = ?");
                $stmt->execute([$devotionalId]);
            } else {
                // Default to today's devotional in admin timezone
                $tz = $settings['admin_timezone'] ?? 'Africa/Lagos';
                $now = getDateInTz($tz);
                // Match the month only — the exact day is compared numerically
                // below (stored dates are zero-padded, e.g. "July 02", so a
                // "July 2%" prefix would wrongly grab "July 20").
                $stmt = $pdo->prepare(
                    "SELECT * FROM devotionals WHERE LOWER(date) LIKE LOWER(?) AND year = ?"
                );
                $stmt->execute([$now['month'] . ' %', $now['year']]);
                $todayDev = null;
                foreach ($stmt->fetchAll() as $cand) {
                    $parts = explode(' ', (string)($cand['date'] ?? ''));
                    if (count($parts) === 2
                        && strtolower($parts[0]) === strtolower($now['month'])
                        && (int)$parts[1] === $now['day']) {
                        $todayDev = $cand;
                        break;
                    }
                }
                $dev = $todayDev;
            }

            if (!$dev) {
                jsonError('No devotional found for the specified ID or today\'s date', 404);
            }

            // Resolve image URL
            $imageUrl = resolveImageUrl($dev);

            // Build Telegram messages — date first, then bold title (same order
            // as the homepage header), and the body mirrors the homepage:
            // Scripture → paragraphs → Additional Scripture → Prayer &
            // Confession → One Year Bible Reading → footer.
            $photoCaption = "<i>📖 " . tgEscape($dev['date'] . ', ' . $dev['year']) . "</i>\n<b>" . tgEscape($dev['title']) . "</b>";
            $bodyText = buildDevotionalBody($dev, $footerText);

            // Step 1: Send photo
            $result = sendTelegramPhoto($botToken, $channelId, $imageUrl, $photoCaption);
            if (!$result['success']) {
                // Photo failed, still try body
            }

            // Step 2: Send body text
            $textResult = sendTelegramMessage($botToken, $channelId, $bodyText);

            $finalSuccess = $textResult['success'] || $result['success'];
            $messageId = $textResult['messageId'] ?? $result['messageId'] ?? null;
            $error = $textResult['error'] ?? $result['error'] ?? null;

            // Log the result
            $logId = generateId();
            $stmt = $pdo->prepare(
                "INSERT INTO telegram_log (id, devotional_id, devotional_title, scheduled_date, scheduled_year, post_time, status, sent_at, telegram_message_id, error)
                 VALUES (?, ?, ?, ?, ?, 'manual', ?, NOW(), ?, ?)"
            );
            $stmt->execute([
                $logId,
                $dev['id'],
                $dev['title'],
                $dev['date'],
                $dev['year'],
                $finalSuccess ? 'sent' : 'failed',
                $messageId,
                $error,
            ]);

            if ($finalSuccess) {
                logActivity('telegram_send', "Devotional \"{$dev['title']}\" broadcast to Telegram.", 'telegram', $dev['id'], $dev['title']);
                jsonResponse([
                    'success'   => true,
                    'messageId' => $messageId,
                    'title'     => $dev['title'],
                ]);
            } else {
                jsonResponse([
                    'success' => false,
                    'error'   => $error ?? 'Failed to send to Telegram',
                ], 500);
            }

        } elseif ($action === 'schedule') {
            requireAdmin();
            // POST /api/telegram/schedule { devotionalIds: ["id1","id2"], postTime?: "06:00" }
            $input = jsonInput();
            $ids = $input['devotionalIds'] ?? null;
            if (!is_array($ids) || empty($ids)) {
                jsonError('devotionalIds (array) is required', 400);
            }
            $postTime = isset($input['postTime']) ? (string)$input['postTime'] : null;

            $settings = getSettings();
            $effectiveTime = $postTime ?? ($settings['telegram_post_time'] ?? '06:00');

            $scheduled = 0;
            $failed = 0;
            foreach ($ids as $id) {
                $stmt = $pdo->prepare("SELECT * FROM devotionals WHERE id = ?");
                $stmt->execute([$id]);
                $dev = $stmt->fetch();
                if (!$dev) { $failed++; continue; }
                if (tgScheduleDevotional($dev, $effectiveTime)) {
                    $scheduled++;
                } else {
                    $failed++;
                }
            }

            logActivity('telegram_schedule', "Scheduled {$scheduled} devotional(s) for Telegram broadcast.", 'telegram');
            jsonResponse([
                'success'   => true,
                'scheduled' => $scheduled,
                'failed'    => $failed,
                'postTime'  => $effectiveTime,
            ]);

        } elseif ($action === 'unschedule') {
            requireAdmin();
            // POST /api/telegram/unschedule { devotionalIds: ["id1","id2"] }
            $input = jsonInput();
            $ids = $input['devotionalIds'] ?? null;
            if (!is_array($ids) || empty($ids)) {
                jsonError('devotionalIds (array) is required', 400);
            }
            $removed = tgUnscheduleDevotionals($ids);
            jsonResponse(['success' => true, 'removed' => $removed]);

        } elseif ($action === 'verify') {
            // POST /api/telegram/verify
            $input = jsonInput();
            $botToken  = $input['botToken'] ?? '';
            $channelId = $input['channelId'] ?? '';

            if (empty($botToken) || empty($channelId)) {
                jsonError('Both bot token and channel ID are required');
            }

            try {
                // Check bot info
                $botRes = @file_get_contents(
                    "https://api.telegram.org/bot{$botToken}/getMe",
                    false,
                    stream_context_create(['http' => ['timeout' => 8]])
                );
                if (!$botRes) {
                    jsonResponse(['success' => false, 'error' => 'Cannot connect to Telegram API']);
                    break;
                }
                $botJson = json_decode($botRes, true);
                if (!$botJson['ok']) {
                    jsonResponse(['success' => false, 'error' => 'Invalid bot token: ' . ($botJson['description'] ?? '')]);
                    break;
                }

                // Check channel access
                $chatRes = @file_get_contents(
                    "https://api.telegram.org/bot{$botToken}/getChat?chat_id=" . urlencode($channelId),
                    false,
                    stream_context_create(['http' => ['timeout' => 8]])
                );
                if (!$chatRes) {
                    jsonResponse(['success' => false, 'error' => 'Cannot verify channel access']);
                    break;
                }
                $chatJson = json_decode($chatRes, true);
                if (!$chatJson['ok']) {
                    jsonResponse([
                        'success' => false,
                        'error'   => 'Cannot access channel: ' . ($chatJson['description'] ?? '') . '. Make sure the bot is added as admin.'
                    ]);
                    break;
                }

                jsonResponse([
                    'success'       => true,
                    'botName'       => $botJson['result']['first_name'] ?? '',
                    'botUsername'   => $botJson['result']['username'] ?? '',
                    'channelTitle'  => $chatJson['result']['title'] ?? '',
                    'channelType'   => $chatJson['result']['type'] ?? '',
                ]);

            } catch (Exception $e) {
                jsonResponse(['success' => false, 'error' => 'Connection failed: ' . $e->getMessage()]);
            }

        } else {
            jsonError('Invalid action. Use: send-now, schedule, unschedule, or verify');
        }
        break;

    default:
        jsonError('Method not allowed', 405);
        break;
}

} // end: if ($isEntryPoint)

// ─── Helper Functions ───────────────────────────────────────────────────────

function getDateInTz(string $timezone): array {
    try {
        $now = new DateTime('now', new DateTimeZone($timezone));
        $months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return [
            'year'  => (int)$now->format('Y'),
            'month' => $months[(int)$now->format('n') - 1],
            'day'   => (int)$now->format('j'),
            'hour'  => (int)$now->format('G'),
            'minute'=> (int)$now->format('i'),
        ];
    } catch (Exception $e) {
        $d = new DateTime();
        $months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return [
            'year'  => (int)$d->format('Y'),
            'month' => $months[(int)$d->format('n') - 1],
            'day'   => (int)$d->format('j'),
            'hour'  => (int)$d->format('G'),
            'minute'=> (int)$d->format('i'),
        ];
    }
}

function resolveImageUrl(array $dev): string {
    // Check mapped headers
    $parts = parseDateParts($dev['date']);
    if ($parts['month'] && $parts['day']) {
        $dateKey = strtolower($parts['month'] . ' ' . $parts['day']);
        global $pdo;
        $stmt = $pdo->prepare("SELECT file_path, data_url FROM header_mappings WHERE LOWER(date_key) = ?");
        $stmt->execute([$dateKey]);
        $header = $stmt->fetch();

        if ($header) {
            if (!empty($header['file_path'])) {
                // Return absolute URL
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                return $scheme . '://' . $host . '/' . ltrim($header['file_path'], '/');
            }
            if (!empty($header['data_url']) && str_starts_with($header['data_url'], 'data:image')) {
                // Reuse existing temp file or create one
                $base64Data = preg_replace('/^data:image\/\w+;base64,/', '', $header['data_url']);
                $tmpDir = ensureUploadDir('headers/tmp');
                $tmpFile = $tmpDir . '/tmp_' . strtolower($parts['month']) . '_' . $parts['day'] . '.jpg';
                // Only write if file doesn't exist (reuse)
                if (!file_exists($tmpFile)) {
                    file_put_contents($tmpFile, base64_decode($base64Data));
                }
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
                return $scheme . '://' . $host . '/upload/headers/tmp/tmp_' . strtolower($parts['month']) . '_' . $parts['day'] . '.jpg';
            }
        }
    }

    // Use devotional's own imageUrl
    if (!empty($dev['image_url']) && str_starts_with($dev['image_url'], 'http')) {
        return $dev['image_url'];
    }

    // Default banner — construct absolute URL for Telegram API
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host . '/assets/images/devotional-title-default.jpg';
}

/**
 * Build the FULL devotional body message, mirroring the homepage layout:
 *
 *   <b>Date, Year</b>                 (same order as the homepage header)
 *   <b>Title</b>
 *
 *   Scripture: <i>ref</i>
 *   "scripture text"
 *
 *   [paragraphs...]
 *
 *   <b>Additional Scripture Reference:</b>
 *   value
 *
 *   <b>Prayer & Confession of Faith:</b>
 *   value
 *
 *   <b>One Year Bible Reading:</b>
 *   value
 *
 *   —
 *   footer
 *
 * All section labels are bold, matching the homepage's bold section headings.
 * Stays within Telegram's 4096-char sendMessage limit; long paragraphs are
 * truncated only if they would push out the labelled sections below.
 */
// Escape text for Telegram's HTML parse mode. Editor content can contain raw
// '&', '<' or '>' — Telegram returns HTTP 400 "can't parse entities" on those,
// failing the whole post. strip_tags() first (labels we add are the only tags
// kept), then encode the remaining text so it renders literally.
function tgEscape(string $text): string {
    $plain = trim(strip_tags($text));
    return htmlspecialchars($plain, ENT_QUOTES, 'UTF-8');
}

function buildDevotionalBody(array $dev, string $footerText): string {
    $maxLen = 4096;
    $reserve = mb_strlen($footerText) + 40; // footer + separator + slack
    $budget = $maxLen - $reserve;

    $sections = [];

    // Date + Title (header block — same as homepage)
    $dateStr = trim((string)($dev['date'] ?? '')) . ', ' . (int)($dev['year'] ?? 0);
    $title = trim((string)($dev['title'] ?? ''));
    if ($dateStr !== ', 0') $sections[] = '<b>' . tgEscape($dateStr) . '</b>';
    if ($title !== '') $sections[] = '<b>' . tgEscape($title) . '</b>';

    // Scripture
    $ref = trim((string)($dev['scripture_ref'] ?? ''));
    $scripture = trim((string)($dev['scripture_text'] ?? ''));
    if ($ref !== '') $sections[] = '<b>Scripture:</b> <i>' . tgEscape($ref) . '</i>';
    if ($scripture !== '') $sections[] = '"' . tgEscape($scripture) . '"';

    // Body paragraphs
    $paragraphs = json_decode($dev['paragraphs'] ?? '[]', true) ?? [];
    foreach ($paragraphs as $para) {
        $plain = tgEscape((string)$para);
        if ($plain !== '') $sections[] = $plain;
    }

    // Additional Scripture Reference (bold label)
    $additional = trim((string)($dev['additional_scripture'] ?? ''));
    if ($additional !== '') $sections[] = "<b>Additional Scripture Reference:</b>\n" . tgEscape($additional);

    // Prayer & Confession of Faith (bold label)
    $prayer = trim((string)($dev['prayer_confession'] ?? ''));
    if ($prayer !== '') $sections[] = "<b>Prayer & Confession of Faith:</b>\n" . tgEscape($prayer);

    // One Year Bible Reading (bold label)
    $bible = trim((string)($dev['bible_reading'] ?? ''));
    if ($bible !== '') $sections[] = "<b>One Year Bible Reading:</b>\n" . tgEscape($bible);

    // Assemble with \n\n separators, truncating only when out of budget.
    $body = '';
    foreach ($sections as $i => $sec) {
        $glue = $i === 0 ? '' : "\n\n";
        $candidate = $body . $glue . $sec;
        if (mb_strlen($candidate) <= $budget) {
            $body = $candidate;
        } else {
            // Keep the section labels above; truncate this section's tail.
            $room = $budget - mb_strlen($body) - mb_strlen($glue);
            if ($room > 24) {
                $body .= $glue . mb_substr($sec, 0, $room) . '…';
            }
            break;
        }
    }

    if ($footerText) $body .= "\n\n—\n" . $footerText;
    return mb_substr($body, 0, $maxLen);
}

function sendTelegramPhoto(string $token, string $chatId, string $photoUrl, string $caption): array {
    try {
        $payload = json_encode([
            'chat_id'    => $chatId,
            'photo'      => $photoUrl,
            'caption'    => mb_substr($caption, 0, 1024),
            'parse_mode' => 'HTML',
        ]);

        $ch = curl_init("https://api.telegram.org/bot{$token}/sendPhoto");
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode($res, true);
        if ($json && $json['ok']) {
            return ['success' => true, 'messageId' => $json['result']['message_id'] ?? null];
        }
        return ['success' => false, 'error' => $json['description'] ?? 'HTTP ' . $httpCode];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}

function sendTelegramMessage(string $token, string $chatId, string $text): array {
    try {
        $payload = json_encode([
            'chat_id'    => $chatId,
            'text'       => $text,
            'parse_mode' => 'HTML',
        ]);

        $ch = curl_init("https://api.telegram.org/bot{$token}/sendMessage");
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $payload,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 15,
        ]);
        $res = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $json = json_decode($res, true);
        if ($json && $json['ok']) {
            return ['success' => true, 'messageId' => $json['result']['message_id'] ?? null];
        }
        return ['success' => false, 'error' => $json['description'] ?? 'HTTP ' . $httpCode];
    } catch (Exception $e) {
        return ['success' => false, 'error' => $e->getMessage()];
    }
}
