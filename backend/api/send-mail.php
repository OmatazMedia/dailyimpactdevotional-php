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
 * Daily Impact Devotional - Email Sending Service (cron worker)
 *
 * Processes queued emails (mail_queue) and delivers each one using the PRIMARY
 * transport (mail_method setting) with the secondary as automatic fallback.
 * Branded HTML bodies are sent when present. Each row records which transport
 * delivered it (method), how many attempts were made, and the latest error —
 * visible in the Mail Delivery Status panel (Settings → Email).
 *
 * Should be run via cron job every minute:
 *   php /home/USERNAME/public_html/backend/api/send-mail.php
 * or over HTTP (secret key required, same key as telegram-cron.php):
 *   curl -s "https://yourdomain.com/backend/api/send-mail.php?key=YOUR_SECRET_KEY" > /dev/null 2>&1
 */

require_once __DIR__ . '/../config/db.php';
sendCorsHeaders();

// HTTP callers must use GET; CLI (cPanel `php backend/api/send-mail.php`) has no
// REQUEST_METHOD, so never 405 the recommended CLI cron setup.
if (php_sapi_name() !== 'cli' && $_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonError('Method not allowed', 405);
}

// Security: require the same cron secret key as telegram-cron.php unless the
// worker runs from the CLI — so it can be triggered over HTTPS via curl without
// becoming an open, unauthenticated endpoint.
$settings = getSettings();
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

$stmt = $pdo->prepare(
    "SELECT * FROM mail_queue
     WHERE sent = 0
     ORDER BY created_at ASC
     LIMIT 20"
);
$stmt->execute();
$emails = $stmt->fetchAll();

$processed = 0;
$failed = 0;

foreach ($emails as $email) {
    $result = mailTransportSend($email);

    if ($result['success']) {
        $processed++;
    } else {
        $failed++;
    }

    if (function_exists('updateMailQueueResult')) {
        updateMailQueueResult($email['id'], $result);
    } elseif ($result['success']) {
        // Legacy fallback for hosts preserving an older config/db.php.
        $upd = $pdo->prepare("UPDATE mail_queue SET sent = 1, sent_at = NOW(), error = NULL WHERE id = ?");
        $upd->execute([$email['id']]);
    } else {
        $upd = $pdo->prepare("UPDATE mail_queue SET error = ? WHERE id = ?");
        $upd->execute([mb_substr($result['error'], 0, 500), $email['id']]);
    }
}

jsonResponse([
    'success' => true,
    'sent'    => $processed,
    'failed'  => $failed,
    'total'   => count($emails),
    'method'  => getSetting('mail_method', 'resend'),
    'message' => count($emails) === 0
        ? 'No pending emails'
        : "Processed {$processed} email(s)" . ($failed > 0 ? ", {$failed} failed" : ''),
]);
