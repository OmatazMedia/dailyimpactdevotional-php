<?php
/**
 * ══════════════════════════════════════════════════════════
 *   Omataz Media — Web Development & Design
 *   Website   : https://www.omatazmedia.com.ng
 *   Email     : hello@omatazmedia.com.ng
 *   Phone     : +234 9024599289, +234 7037373304
 *   WhatsApp  : https://wa.me/message/M3QUHNVONY6NK1
 *   Social    : @omatazmedia — Facebook · Instagram · X · YouTube
 *   GitHub    : https://github.com/omatazmedia
 *   Contact   : Johnson Toluwani
 * ══════════════════════════════════════════════════════════
 */

/**
 * Daily Impact Devotional - Telegram Scheduler Cron
 * 
 * GET /api/telegram/cron - Run one scheduler tick
 * 
 * Set up a cPanel cron job to call this every 5-10 minutes (CLI is simplest):
 *   php /home/USERNAME/public_html/backend/api/telegram-cron.php
 * or over HTTP (key required):
 *   curl -s "https://yourdomain.com/backend/api/telegram-cron.php?key=YOUR_SECRET_KEY" > /dev/null
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
 *
 * The tick logic lives in tgRunCronTick() (telegram.php), shared with the
 * Dashboard's "Run cron now (test)" button. Each REAL cron run records
 * cron_last_run / cron_last_result so the Telegram page can show freshness.
 */

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/tg-schedule.php';
sendCorsHeaders();

// Load Telegram helper functions (getDateInTz, resolveImageUrl, sendTelegram*,
// buildDevotionalBody, tgRunCronTick).
require_once __DIR__ . '/telegram.php';

// HTTP callers must use GET; CLI (cPanel `php backend/api/telegram-cron.php`)
// has no REQUEST_METHOD, so never 405 the recommended CLI cron setup.
if (php_sapi_name() !== 'cli' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
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

// Run one full tick (the same logic the Dashboard "Run now (test)" uses).
$result = tgRunCronTick();

// Record this run so the Telegram page can show "last cron run" freshness.
// Only the REAL cron writes these — a manual dashboard test must not mask a
// dead cron job.
setSetting('cron_last_run', date('c'));
setSetting('cron_last_result', mb_substr((string)($result['message'] ?? ''), 0, 250));

jsonResponse([
    'success' => $result['success'] ?? false,
    'posted'  => $result['posted'] ?? 0,
    'titles'  => $result['titles'] ?? [],
    'message' => $result['message'] ?? '',
    'skipped' => !empty($result['skipped']),
]);
